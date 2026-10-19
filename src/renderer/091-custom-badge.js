// YapCord Custom Badge: always-on, client-side visual badge for selected user IDs.
// This does not grant permissions or alter server roles. Only users running this client see it.

(function () {
  const BADGE_CLASS = 'ym-custom-staff-badge';
  const BADGED = new Set([
    'e46be3da-39b3-4a1a-b003-042d27d71e9d',
    'fc529a6a-ddbd-445b-8bce-18a13acca5d0',
  ]);
  const NAME_SELECTORS = '.msg-author, .voice-person .name, .chat-row .name, .pc2-head';
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

  function decorateRoot(root) {
    if (!root || !root.querySelectorAll) return;
    const candidates = root.matches && root.matches(NAME_SELECTORS) ? [root] : [];
    root.querySelectorAll(NAME_SELECTORS).forEach((el) => candidates.push(el));
    for (const nameEl of candidates) {
      const id = userIdFor(nameEl);
      if (BADGED.has(id)) addBadge(nameEl);
      else nameEl.querySelectorAll(':scope > .' + BADGE_CLASS).forEach((el) => el.remove());
    }
  }

  function start() {
    const offDecorate = YM.messages.decorate(({ el, message }) => {
      try {
        const id = message && (message.author_id || message.authorId);
        const nameEl = el && el.querySelector(MSG_AUTHOR);
        if (!nameEl) return;
        if (BADGED.has(String(id))) addBadge(nameEl);
        else nameEl.querySelectorAll(':scope > .' + BADGE_CLASS).forEach((node) => node.remove());
      } catch (_) { /* ignore individual rows */ }
    });

    let queued = false;
    const sweep = () => {
      queued = false;
      try { decorateRoot(document); } catch (_) { /* ignore */ }
    };
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(sweep);
    };
    const offMutate = YM.dom.onMutate(queue);
    const safety = setInterval(sweep, 10000);
    queue();

    return () => {
      clearInterval(safety);
      try { offDecorate && offDecorate(); } catch (_) {}
      try { offMutate && offMutate(); } catch (_) {}
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
