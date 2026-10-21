// YapCord role badges are local visual labels. They never change Yapper roles or permissions.

(function () {
  const BADGE_CLASS = 'ym-custom-role-badge';
  const ROLE_BY_USER_ID = new Map([
    ['e46be3da-39b3-4a1a-b003-042d27d71e9d', { key: 'owner', label: 'Owner', icon: 'crown' }],
    ['fc529a6a-ddbd-445b-8bce-18a13acca5d0', { key: 'contributor', label: 'Contributor', icon: 'star' }],
  ]);
  const ICON_PATHS = Object.freeze({
    crown: ['M3 6.5 7.2 10l4.8-6 4.8 6L21 6.5 18.7 18H5.3L3 6.5z', 'M5.5 21h13'],
    star: ['M12 2.9 14.8 8.6l6.3.9-4.55 4.43 1.08 6.27L12 17.25l-5.63 2.95 1.08-6.27L2.9 9.5l6.3-.9L12 2.9z'],
    og: ['M12 2.5 14.1 4l2.6-.1 1.1 2.4 2.4 1.1-.1 2.6 1.5 2-1.5 2 .1 2.6-2.4 1.1-1.1 2.4-2.6-.1-2.1 1.5-2.1-1.5-2.6.1-1.1-2.4-2.4-1.1.1-2.6-1.5-2 1.5-2-.1-2.6 2.4-1.1 1.1-2.4 2.6.1L12 2.5z', 'm12 6.8 1.55 3.15 3.48.5-2.52 2.45.6 3.46L12 14.72l-3.11 1.64.6-3.46-2.52-2.45 3.48-.5L12 6.8z'],
  });
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NON_MESSAGE_NAMES = '.voice-person .name, .chat-row .name, .pc2-head';
  const MSG_AUTHOR = ':scope > .msg-body > .msg-head > .msg-author:not(.webhook-author)';

  function setting(key, fallback) {
    try { return YM.settings.get('badges.' + key, fallback); } catch (_) { return fallback; }
  }

  function normalizeRoleName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }

  function currentServerId() {
    const state = YM.Store.getState();
    if (!state) return null;
    const channel = state.activeChannelId && state.channels && state.channels[state.activeChannelId];
    if (channel) return channel.server_id || channel.guild_id || null;
    return state.activeServerId || null;
  }

  function serverIdForMessage(message) {
    if (!message) return currentServerId();
    const direct = message.server_id || message.guild_id;
    if (direct) return direct;
    const channelId = message.channel_id || message.channelId;
    const channel = channelId && YM.Store.channel(channelId);
    // A loaded DM channel is explicitly not a server; never borrow a stale active server ID.
    if (channel) return channel.server_id || channel.guild_id || null;
    return currentServerId();
  }

  function hasRoleNamed(userId, serverId, requestedName) {
    if (!userId || !serverId) return false;
    const wanted = normalizeRoleName(requestedName);
    if (!wanted) return false;
    const state = YM.Store.getState();
    if (!state) return false;
    const ids = state.memberRoles && state.memberRoles[serverId] && state.memberRoles[serverId][userId];
    const roles = state.roles && state.roles[serverId];
    if (!Array.isArray(ids) || !Array.isArray(roles)) return false;
    return roles.some((role) => role && ids.includes(role.id) && normalizeRoleName(role.name) === wanted);
  }

  function badgesFor(userId, serverId) {
    const badges = [];
    const fixed = ROLE_BY_USER_ID.get(String(userId || ''));
    if (fixed && fixed.key === 'owner' && setting('showOwner', true)) badges.push(fixed);
    if (fixed && fixed.key === 'contributor' && setting('showContributor', true)) badges.push(fixed);
    if (setting('showOgYapper', true) && hasRoleNamed(userId, serverId, setting('ogRoleName', 'OG Yapper'))) {
      badges.push({ key: 'og', label: 'OG Yapper', icon: 'og' });
    }
    return badges;
  }

  function makeIcon(role) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const d of ICON_PATHS[role.icon] || []) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', role.icon === 'og' && d.startsWith('m12') ? 'none' : 'currentColor');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.8');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
    }
    return svg;
  }

  function addBadge(nameEl, role) {
    const label = 'YapCord ' + role.label;
    const badge = YM.dom.h('span', {
      class: BADGE_CLASS,
      title: label,
      'aria-label': label,
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

  function serverIdForElement(el) {
    const host = el && el.closest ? el.closest('[data-server-id], [data-guild-id]') : null;
    if (host) return host.getAttribute('data-server-id') || host.getAttribute('data-guild-id') || null;
    return currentServerId();
  }

  function syncName(nameEl, id = userIdFor(nameEl), serverId = serverIdForElement(nameEl)) {
    if (!nameEl) return;
    const desired = badgesFor(String(id || ''), serverId);
    const existing = Array.from(nameEl.querySelectorAll(':scope > .' + BADGE_CLASS));
    const isCurrent = existing.length === desired.length && desired.every((role, i) => existing[i].getAttribute('data-ym-role') === role.key);
    if (isCurrent) return;
    existing.forEach((el) => el.remove());
    if (!desired.length) return;

    // Replace the optional personal-crown emoji when a YapCord role badge is visible.
    nameEl.querySelectorAll(':scope > .ym-owner-crown').forEach((el) => el.remove());
    desired.forEach((role) => addBadge(nameEl, role));
  }

  function decorateMessage({ el, message }) {
    const nameEl = el && el.querySelector(MSG_AUTHOR);
    if (!nameEl) return;
    const id = message && (message.author_id || message.authorId) || userIdFor(nameEl);
    syncName(nameEl, id, serverIdForMessage(message));
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
    const refreshAll = () => {
      queueNonMessageSync();
      YM.messages.refresh();
    };
    const offDecorate = YM.messages.decorate(decorateMessage);
    const offUserNames = YM.dom.watch(NON_MESSAGE_NAMES, syncName);
    const offStore = YM.Events.on('store:change', (next, prev) => {
      const rolesChanged = next.roles !== prev.roles || next.memberRoles !== prev.memberRoles || next.activeServerId !== prev.activeServerId;
      const namesChanged = next.profiles !== prev.profiles || next.voiceMembers !== prev.voiceMembers || next.channels !== prev.channels || next.activeChannelId !== prev.activeChannelId;
      if (rolesChanged || namesChanged) queueNonMessageSync();
      if (rolesChanged || next.channels !== prev.channels || next.activeChannelId !== prev.activeChannelId) YM.messages.refresh();
    });
    const offStoreReady = YM.Events.on('store:ready', refreshAll);
    const offSettings = YM.settings.onChange((path) => {
      if (String(path || '').startsWith('badges.')) refreshAll();
    });
    syncNonMessageNames();
    YM.messages.forEachVisible(decorateMessage);

    return () => {
      if (syncFrame !== null) cancelAnimationFrame(syncFrame);
      try { offDecorate && offDecorate(); } catch (_) {}
      try { offUserNames && offUserNames(); } catch (_) {}
      try { offStore && offStore(); } catch (_) {}
      try { offStoreReady && offStoreReady(); } catch (_) {}
      try { offSettings && offSettings(); } catch (_) {}
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
      position: relative;
      isolation: isolate;
      box-sizing: border-box;
      flex: 0 0 .98em;
      width: .98em;
      min-width: .98em;
      height: .98em;
      align-items: center;
      justify-content: center;
      margin: 0 0 0 .32em;
      padding: .15em;
      border: 1px solid rgba(255,255,255,.38);
      border-radius: .3em;
      color: #fff;
      font-size: 1em;
      line-height: 0;
      vertical-align: -.1em;
      white-space: nowrap;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.32), 0 0 0 1px rgba(10,12,20,.22), 0 0 5px var(--ym-badge-glow), 0 0 10px color-mix(in srgb, var(--ym-badge-glow) 42%, transparent);
      user-select: none;
    }
    .${BADGE_CLASS}[data-ym-role="owner"] { --ym-badge-glow: #a978ff; background: linear-gradient(145deg, #9b69ff, #6435df); }
    .${BADGE_CLASS}[data-ym-role="contributor"] { --ym-badge-glow: #ffcf50; background: linear-gradient(145deg, #ffe58b, #d99508); color: #573800; border-color: rgba(255,242,190,.76); }
    .${BADGE_CLASS}[data-ym-role="og"] { --ym-badge-glow: #42d9d0; background: linear-gradient(145deg, #42d9d0, #087e9d); }
    .${BADGE_CLASS} svg { display: block; flex: none; width: .72em; height: .72em; overflow: visible; }
  `);
})();
