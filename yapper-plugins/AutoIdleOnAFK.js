// AutoIdleOnAFK: set status to idle after N minutes without input, restore prior status on activity.
//
// Yapper's presence module differs per version, so this tries several strategies in order:
//   1) a lazily-found module exporting setStatus / setPresence / updatePresence
//   2) store state fields that look like presence (status / presence / userStatus)
//   3) visual fallback: prefix document.title with "💤 " while idle (always works)
// The prior status is restored on the next key/mouse/touch input.

(function () {
  const FIELDS = ['status', 'presence', 'userStatus', 'userPresence', 'onlineStatus'];
  const ACTIONS = ['setStatus', 'setPresence', 'updatePresence', 'updateStatus', 'setUserStatus'];

  function findAction() {
    try {
      const mod = YM.finder.findExports(ACTIONS.slice(0, 2)) || YM.finder.findExports(ACTIONS);
      if (!mod) return null;
      for (const name of ACTIONS) {
        if (typeof mod[name] === 'function') return { mod, name };
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  function readStatus() {
    try {
      const st = YM.Store.getState();
      for (const f of FIELDS) {
        if (st && typeof st[f] === 'string' && st[f]) return { kind: 'store', field: f, value: st[f] };
      }
      const me = YM.Store.me && YM.Store.me();
      for (const f of FIELDS) {
        if (me && typeof me[f] === 'string' && me[f]) return { kind: 'profile', field: f, value: me[f] };
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  function applyStatus(target, idle) {
    const value = idle ? 'idle' : target;
    // Strategy 1: dedicated action module.
    const found = findAction();
    if (found) {
      try {
        found.mod[found.name](value);
        return 'action:' + found.name;
      } catch (err) {
        YM.log.warn('AutoIdleOnAFK action failed', err);
      }
    }
    // Strategy 2: store field.
    try {
      const st = YM.Store.getState();
      for (const f of FIELDS) {
        if (st && st[f] !== undefined) {
          YM.Store.setState({ [f]: value });
          return 'store:' + f;
        }
      }
    } catch (err) {
      YM.log.warn('AutoIdleOnAFK store write failed', err);
    }
    return null;
  }

  YM.definePlugin({
    name: 'AutoIdleOnAFK',
    description: 'Sets you idle after N minutes without input and restores your previous status on activity.',
    authors: ['YapCord'],
    tags: ['Status', 'Utility'],
    enabledByDefault: false,
    options: {
      idleMinutes: { type: 'number', default: 5, min: 1, max: 60, step: 1, description: 'Minutes of inactivity before going idle' },
      restoreOnActivity: { type: 'boolean', default: true, description: 'Restore the previous status on activity' },
      warnBefore: { type: 'boolean', default: true, description: 'Toast a 60s warning before going idle' },
      showToast: { type: 'boolean', default: true, description: 'Show a toast when going idle / back' },
    },
    start(ctx) {
      let lastActivity = Date.now();
      let idle = false;
      let prior = null; // { value } to restore
      let priorTitle = document.title;
      let timer = null;

      function poke() {
        lastActivity = Date.now();
        warned = false;
        if (!idle) return;
        idle = false;
        document.title = priorTitle;
        if (ctx.settings.store.restoreOnActivity && prior) {
          const how = applyStatus(prior.value, false);
          ctx.log.info('back from idle, restored status via ' + (how || 'title only'));
        }
        if (ctx.settings.store.showToast) YM.toast('Welcome back — status restored', { type: 'success' });
        prior = null;
      }

      let warned = false;
      function check() {
        if (idle) return;
        const mins = Math.max(1, Number(ctx.settings.store.idleMinutes) || 5);
        const awayMs = Date.now() - lastActivity;
        if (awayMs < mins * 60 * 1000) {
          if (ctx.settings.store.warnBefore && !warned && mins * 60 * 1000 - awayMs <= 60000) {
            warned = true;
            YM.toast('Going idle in under a minute — move the mouse to stay online', { type: 'info' });
          }
          return;
        }
        warned = false;
        idle = true;
        priorTitle = document.title;
        prior = readStatus() || { value: 'online' };
        const how = applyStatus(prior.value, true);
        if (!how) {
          // Visual fallback so AFK is at least visible in the tab/taskbar.
          if (!document.title.startsWith('💤')) document.title = '💤 Idle · ' + document.title;
        }
        ctx.log.info('AFK idle after ' + mins + ' min (via ' + (how || 'title fallback') + ')');
        if (ctx.settings.store.showToast) YM.toast('Marked idle (AFK ' + mins + ' min)', { type: 'info' });
      }

      const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'click'];
      const onActivity = () => poke();
      // Capture + passive: see activity even when Yapper stops propagation.
      events.forEach((ev) => document.addEventListener(ev, onActivity, { capture: true, passive: true }));
      // Tab visibility also counts as activity when the user comes back.
      const onVis = () => { if (!document.hidden) poke(); };
      document.addEventListener('visibilitychange', onVis);

      timer = setInterval(check, 15000);
      check();

      ctx.cleanup(() => {
        clearInterval(timer);
        events.forEach((ev) => document.removeEventListener(ev, onActivity, { capture: true }));
        document.removeEventListener('visibilitychange', onVis);
        if (idle) {
          document.title = priorTitle;
          if (ctx.settings.store.restoreOnActivity && prior) {
            try { applyStatus(prior.value, false); } catch (_) {}
          }
        }
      });
    },
  });
})();
