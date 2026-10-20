// YapCord Custom Badge: always-on, client-side visual badge for selected user IDs.
// This does not grant permissions or alter server roles. Only users running this client see it.

(function () {
  const BADGE_CLASS = 'ym-custom-staff-badge';
  const BADGED = new Set([
    'e46be3da-39b3-4a1a-b003-042d27d71e9d',
    'fc529a6a-ddbd-445b-8bce-18a13acca5d0',
  ]);
  const NON_MESSAGE_NAMES = '.voice-person .name, .chat-row .name, .pc2-head';
  const MSG_AUTHOR = ':scope > .msg-body > .msg-head > .msg-author:not(.webhook-author)';

  function addBadge(nameEl) {
    if (!nameEl || nameEl.querySelector(':scope > .' + BADGE_CLASS)) return;
    nameEl.append(YM.dom.h('span', {
      class: BADGE_CLASS,
      title: 'YapCord Staff',
      'aria-label': 'YapCord Staff',
    }, 'STAFF'));
  }

  function userIdFor(el) {
    const host = el && el.closest ? el.closest('[data-user-id]') : null;
    return (host && host.getAttribute('data-user-id'))
      || (el && el.getAttribute && el.getAttribute('data-user-id'))
      || '';
  }

  function syncName(nameEl, id = userIdFor(nameEl)) {
    if (!nameEl) return;
    if (BADGED.has(String(id))) addBadge(nameEl);
    else nameEl.querySelectorAll(':scope > .' + BADGE_CLASS).forEach((el) => el.remove());
  }

  function decorateMessage({ el, message }) {
    const nameEl = el && el.querySelector(MSG_AUTHOR);
    if (!nameEl) return;
    const id = message && (message.author_id || message.authorId) || userIdFor(nameEl);
    syncName(nameEl, id);
  }

  function syncNonMessageNames() {
    document.querySelectorAll(NON_MESSAGE_NAMES).forEach((el) => syncName(el));
  }

  function start() {
    let syncFrame = null;
    const queueNonMessageSync = () => {
      if (syncFrame !== null) return;
      syncFrame = requestAnimationFrame(() => {
        syncFrame = null;
        syncNonMessageNames();
      });
    };
    const offDecorate = YM.messages.decorate(decorateMessage);
    const offUserNames = YM.dom.watch(NON_MESSAGE_NAMES, syncName);
    const offStore = YM.Events.on('store:change', (next, prev) => {
      if (next.profiles !== prev.profiles || next.voiceMembers !== prev.voiceMembers || next.channels !== prev.channels || next.activeChannelId !== prev.activeChannelId) {
        queueNonMessageSync();
      }
    });
    const offStoreReady = YM.Events.on('store:ready', () => YM.messages.forEachVisible(decorateMessage));
    syncNonMessageNames();
    YM.messages.forEachVisible(decorateMessage);

    return () => {
      if (syncFrame !== null) cancelAnimationFrame(syncFrame);
      try { offDecorate && offDecorate(); } catch (_) {}
      try { offUserNames && offUserNames(); } catch (_) {}
      try { offStore && offStore(); } catch (_) {}
      try { offStoreReady && offStoreReady(); } catch (_) {}
      document.querySelectorAll('.' + BADGE_CLASS).forEach((el) => el.remove());
    };
  }

  // Core behavior: no plugin toggle or user setting is required.
  YM.Events.once('boot:ready', () => {
    try { YM.customBadgeCleanup = start(); } catch (err) { YM.log && YM.log.warn('custom badge failed', err); }
  });

  YM.dom.css.set('custom-staff-badge', `
    .${BADGE_CLASS} {
      display: inline-flex;
      align-items: center;
      margin-left: 5px;
      padding: 2px 6px;
      border-radius: 999px;
      background: linear-gradient(135deg, #7c5cff, #b05cff);
      color: #fff;
      font-size: .62em;
      font-weight: 800;
      letter-spacing: .04em;
      line-height: 1.35;
      vertical-align: middle;
      box-shadow: 0 1px 4px rgba(124,92,255,.45);
      user-select: none;
    }
  `);
})();
