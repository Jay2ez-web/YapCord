// YapCord role badges are purely visual and client-side; they never change Yapper permissions or server roles.

(function () {
  const BADGE_CLASS = 'ym-custom-role-badge';
  const ROLE_BY_USER_ID = new Map([
    ['e46be3da-39b3-4a1a-b003-042d27d71e9d', { key: 'owner', label: 'Owner', icon: 'crown' }],
    ['fc529a6a-ddbd-445b-8bce-18a13acca5d0', { key: 'contributor', label: 'Contributor', icon: 'star' }],
  ]);
  const ICON_PATHS = Object.freeze({
    crown: 'M3 7l5 4 4-7 4 7 5-4-2 11H5L3 7z M6 21h12',
    star: 'M12 3l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.4l-5.25 2.8 1-5.85L3.5 9.2l5.9-.9L12 3z',
  });
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NON_MESSAGE_NAMES = '.voice-person .name, .chat-row .name, .pc2-head';
  const MSG_AUTHOR = ':scope > .msg-body > .msg-head > .msg-author:not(.webhook-author)';

  function makeIcon(role) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICON_PATHS[role.icon]);
    path.setAttribute('fill', role.icon === 'star' ? 'currentColor' : 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    return svg;
  }

  function addBadge(nameEl, role) {
    const badge = YM.dom.h('span', {
      class: BADGE_CLASS,
      title: 'YapCord ' + role.label,
      'aria-label': 'YapCord ' + role.label,
      role: 'img',
    });
    badge.setAttribute('data-ym-role', role.key);
    badge.append(makeIcon(role));
    nameEl.append(badge);
  }

  function userIdFor(el) {
    const host = el && el.closest ? el.closest('[data-user-id]') : null;
    return (host && host.getAttribute('data-user-id'))
      || (el && el.getAttribute && el.getAttribute('data-user-id'))
      || '';
  }

  function syncName(nameEl, id = userIdFor(nameEl)) {
    if (!nameEl) return;
    const role = ROLE_BY_USER_ID.get(String(id || ''));
    const existing = nameEl.querySelector(':scope > .' + BADGE_CLASS);
    const expectedRole = role ? role.key : null;
    if (existing && existing.getAttribute('data-ym-role') === expectedRole) return;
    if (existing) existing.remove();
    if (!role) return;

    // Replace the optional personal-crown emoji with the role icon so the owner gets one badge.
    nameEl.querySelectorAll(':scope > .ym-owner-crown').forEach((el) => el.remove());
    addBadge(nameEl, role);
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
    try { YM.customBadgeCleanup = start(); } catch (err) { YM.log && YM.log.warn('custom role badge failed', err); }
  });

  YM.dom.css.set('custom-role-badge', `
    .${BADGE_CLASS} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.25em;
      height: 1.25em;
      margin-left: 5px;
      padding: 2px;
      border-radius: 999px;
      background: linear-gradient(135deg, #7c5cff, #b05cff);
      color: #fff;
      font-size: .72em;
      line-height: 1;
      vertical-align: middle;
      box-shadow: 0 1px 4px rgba(124,92,255,.45);
      user-select: none;
    }
    .${BADGE_CLASS} svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `);
})();
