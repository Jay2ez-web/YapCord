// ForceOwnerCrown: client-side 👑 next to YOUR name everywhere.
//
// Purely visual: only you see it. It does not grant ownership, roles, or permissions on the server,
// and other users still see the real badges. Works in messages, member list, profiles, and voice tiles.
//
// Performance: your id/name are cached (refreshed on login change); message rows go through the
// cheap decoration API, everything else is one throttled sweep per frame plus a 15s safety sweep.

(function () {
  const CROWN_CLASS = 'ym-owner-crown';

  // Real Yapper classes (verified against the other plugins that work).
  const MSG_AUTHOR = ':scope > .msg-body > .msg-head > .msg-author:not(.webhook-author)';
  const NAME_IN = '.msg-author, .voice-person .name, .chat-row .name, .pc2-head';

  YM.definePlugin({
    name: 'ForceOwnerCrown',
    description: 'Shows a 👑 next to your own name everywhere (messages, member list, profile, voice). Client-side only — nobody else sees it.',
    authors: ['YapCord'],
    tags: ['Appearance', 'Fun'],
    enabledByDefault: false,
    options: {
      crown: { type: 'string', default: '👑', description: 'Crown character / emoji' },
      goldName: { type: 'boolean', default: true, description: 'Also tint your username gold' },
      showInMessages: { type: 'boolean', default: true, description: 'Crown in chat messages' },
      showInMembers: { type: 'boolean', default: true, description: 'Crown in the member list' },
      showInProfile: { type: 'boolean', default: true, description: 'Crown in profile popouts / modals' },
      showInVoice: { type: 'boolean', default: true, description: 'Crown in voice channel tiles' },
    },
    start(ctx) {
      // Cached identity: refreshed when the store reports a different user (login/logout/switch).
      let me = null;
      let myName = '';
      const refreshMe = () => {
        try {
          me = YM.Store.myId();
          myName = me ? YM.Store.displayName(me) : '';
        } catch (_) {
          me = null;
          myName = '';
        }
      };
      refreshMe();

      const glyph = () => ctx.settings.store.crown || '👑';

      function addCrown(nameEl) {
        if (!nameEl || nameEl.querySelector(':scope > .' + CROWN_CLASS)) return;
        nameEl.append(YM.dom.h('span', {
          class: CROWN_CLASS,
          title: 'Server owner (shown only to you)',
          'aria-label': 'Server owner (client-side)',
        }, glyph()));
      }

      // True when this element is (or belongs to) me: explicit user id wins, else my display name.
      function isMine(el) {
        if (!me) return false;
        const host = el.closest ? el.closest('[data-user-id]') : null;
        const elUser = (host && host.getAttribute('data-user-id'))
          || (el.getAttribute ? el.getAttribute('data-user-id') : null);
        if (elUser) return elUser === me;
        return !!(myName && (el.textContent || '').trim() === myName);
      }

      // 1) Chat messages via the decoration API (cheapest path: runs only for rendered rows).
      const offDecorate = YM.messages.decorate(({ el, message }) => {
        try {
          if (!ctx.settings.store.showInMessages || !me) return;
          const msg = message || YM.Store.findMessage(el.getAttribute('data-message-id'));
          if (!msg || msg.author_id !== me) {
            el.querySelectorAll('.' + CROWN_CLASS).forEach((n) => n.remove());
            return;
          }
          const nameEl = el.querySelector(MSG_AUTHOR);
          if (nameEl) addCrown(nameEl);
        } catch (_) { /* ignore */ }
      });

      // 2) Member list / profile / voice / chat rows: one throttled sweep, at most once per frame.
      function sweep() {
        sweepQueued = false;
        try {
          if (!me) return;
          const st = ctx.settings.store;
          const roots = [];
          if (st.showInMembers) {
            document.querySelectorAll('.members-panel').forEach((p) => roots.push(p));
            document.querySelectorAll('[data-user-id="' + CSS.escape(me) + '"]').forEach((n) => roots.push(n));
          }
          if (st.showInProfile) {
            document.querySelectorAll('.profile-card, [role=dialog], .modal').forEach((p) => roots.push(p));
          }
          if (st.showInVoice) {
            document.querySelectorAll('.voice-person, [class*=voice i]').forEach((p) => roots.push(p));
          }
          document.querySelectorAll('.chat-row').forEach((p) => roots.push(p));
          const seen = new Set();
          for (const root of roots) {
            if (seen.has(root)) continue;
            seen.add(root);
            // The root itself may be the name element (e.g. a .name span).
            const cands = root.matches && root.matches(NAME_IN) ? [root] : [];
            root.querySelectorAll(NAME_IN).forEach((n) => cands.push(n));
            for (const el of cands) {
              if (el.querySelector(':scope > .' + CROWN_CLASS)) continue;
              if (isMine(el)) addCrown(el);
            }
          }
        } catch (_) { /* ignore */ }
      }
      let sweepQueued = false;
      const queueSweep = () => {
        if (sweepQueued) return;
        sweepQueued = true;
        requestAnimationFrame(sweep);
      };

      const offMut = YM.dom.onMutate(queueSweep);
      const safety = setInterval(sweep, 15000); // catches anything the observer missed
      const offStore = YM.Events.on('store:change', (next, prev) => {
        if ((next.userId || null) !== (prev.userId || null)) {
          refreshMe();
          document.querySelectorAll('.' + CROWN_CLASS).forEach((n) => n.remove());
        }
        if (next.activeChannelId !== prev.activeChannelId || next.activeServerId !== prev.activeServerId) queueSweep();
      });
      const offSettings = ctx.settings.onChange(() => {
        document.querySelectorAll('.' + CROWN_CLASS).forEach((n) => n.remove());
        YM.messages.refresh();
        queueSweep();
      });

      YM.Store.ready.then(() => { refreshMe(); sweep(); }).catch(() => undefined);
      queueSweep();

      ctx.cleanup(() => {
        clearInterval(safety);
        try { offDecorate && offDecorate(); } catch (_) {}
        try { offMut && offMut(); } catch (_) {}
        try { offStore && offStore(); } catch (_) {}
        try { offSettings && offSettings(); } catch (_) {}
        document.querySelectorAll('.' + CROWN_CLASS).forEach((n) => n.remove());
      });

      ctx.css(`
.${CROWN_CLASS} { margin-left: 4px; font-size: 0.95em; line-height: 1; vertical-align: baseline; filter: drop-shadow(0 1px 2px rgba(0,0,0,.4)); }
html[data-ym-crown-gold] .msg-author:has(> .${CROWN_CLASS}) { color: #f5b301 !important; font-weight: 700; }
`);
      const syncGold = () => document.documentElement.toggleAttribute('data-ym-crown-gold', !!ctx.settings.store.goldName);
      syncGold();
      const offGold = ctx.settings.onChange(syncGold);
      ctx.cleanup(() => {
        try { offGold && offGold(); } catch (_) {}
        document.documentElement.removeAttribute('data-ym-crown-gold');
      });
    },
  });
})();
