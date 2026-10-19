// PermissionsViewer (port): see what a member can do in a server, and what each role is allowed.
(function () {
  const GROUPS = [
    ['General', [['manage_channels', 'Manage Channels'], ['manage_roles', 'Manage Roles'], ['manage_emojis', 'Manage Emoji'], ['manage_server', 'Manage Server'], ['manage_webhooks', 'Manage Webhooks'], ['create_invite', 'Create Invite'], ['change_nickname', 'Change Nickname'], ['manage_nicknames', 'Manage Nicknames']]],
    ['Membership', [['kick_members', 'Kick Members'], ['ban_members', 'Ban Members'], ['timeout_members', 'Timeout Members']]],
    ['Text', [['send_messages', 'Send Messages'], ['embed_links', 'Embed Links'], ['attach_files', 'Attach Files'], ['send_voice_messages', 'Send Voice Messages'], ['add_reactions', 'Add Reactions'], ['use_external_emojis', 'Use External Emoji'], ['create_polls', 'Create Polls'], ['mention_everyone', 'Mention @everyone'], ['manage_messages', 'Manage Messages'], ['read_history', 'Read Message History']]],
    ['Voice', [['connect', 'Connect'], ['speak', 'Speak'], ['mute_members', 'Mute Members'], ['move_members', 'Move Members']]],
  ];
  const DANGER = new Set(['kick_members', 'ban_members', 'timeout_members', 'manage_server', 'manage_roles', 'administrator']);
  // Same rules as Yapper itself: manage_server and manage_messages imply some other permissions, everyone starts with a set of basics.
  const IMPLIED_BY_MANAGE_SERVER = ['manage_server', 'manage_channels', 'manage_roles', 'manage_emojis', 'kick_members', 'ban_members', 'timeout_members', 'manage_nicknames', 'manage_messages', 'mention_everyone', 'mute_members', 'move_members'];
  const IMPLIED_BY_MANAGE_MESSAGES = ['manage_messages', 'timeout_members', 'manage_nicknames', 'mention_everyone', 'mute_members'];
  const EVERYONE_DEFAULTS = ['send_messages', 'add_reactions', 'attach_files', 'embed_links', 'use_external_emojis', 'create_invite', 'change_nickname', 'connect', 'speak', 'create_polls', 'read_history', 'send_voice_messages'];
  const ALL_KEYS = GROUPS.flatMap(([, list]) => list.map(([k]) => k));

  function roleHas(role, key) {
    return !!(role.perms && role.perms.administrator) || !!(role.manage_server && IMPLIED_BY_MANAGE_SERVER.includes(key)) || !!(role.manage_messages && IMPLIED_BY_MANAGE_MESSAGES.includes(key)) || !!(role.perms && role.perms[key]);
  }

  /** @returns {{ owner: boolean, admin: boolean, perms: Set<string>, roles: object[] }} */
  function effective(state, serverId, userId) {
    const server = state.servers && state.servers[serverId];
    const all = (state.roles && state.roles[serverId]) || [];
    const mine = (state.memberRoles && state.memberRoles[serverId] && state.memberRoles[serverId][userId]) || [];
    const roles = all.filter((r) => mine.includes(r.id) && (!r.auto || r.auto === 'none'));
    const owner = !!(server && server.owner_id === userId);
    const admin = roles.some((r) => r.perms && r.perms.administrator);
    const perms = new Set();
    if (owner || admin) ALL_KEYS.forEach((k) => perms.add(k));
    else {
      for (const k of ALL_KEYS) if (roles.some((r) => roleHas(r, k))) perms.add(k);
      for (const k of EVERYONE_DEFAULTS) if (!server || !server.everyone_perms || server.everyone_perms[k] !== false) perms.add(k);
    }
    return { owner, admin, perms, roles };
  }

  function permList(has) {
    const h = YM.dom.h;
    return GROUPS.map(([title, list]) => [
      h('div', { class: 'ym-sub' }, title),
      h('div', { class: 'ym-perm-list' }, list.map(([k, label]) => h('span', { class: 'ym-perm' + (has(k) ? (DANGER.has(k) ? ' danger' : '') : ' no'), title: k }, label))),
    ]);
  }

  function openMember(serverId, userId) {
    const h = YM.dom.h;
    const s = YM.Store.getState();
    if (!s || !s.servers[serverId]) { YM.toast('Open a server first.'); return null; }
    const e = effective(s, serverId, userId);
    const name = YM.Store.displayName(userId);
    return YM.modal.open({
      title: 'Permissions of ' + name,
      subtitle: s.servers[serverId].name + (e.owner ? ' · server owner (everything)' : e.admin ? ' · administrator (everything)' : ''),
      wide: true,
      body: [
        h('div', { class: 'ym-sub' }, 'Roles'),
        e.roles.length ? e.roles.map((r) => h('span', { class: 'ym-chip' }, h('i', { style: { background: r.color || '' } }), r.name)) : h('span', { class: 'ym-hint' }, 'No roles (only the permissions every member has).'),
        permList((k) => e.perms.has(k)),
      ],
    });
  }

  function openServer(serverId) {
    const h = YM.dom.h;
    const s = YM.Store.getState();
    const roles = ((s && s.roles && s.roles[serverId]) || []).filter((r) => !r.auto || r.auto === 'none');
    if (!s || !s.servers[serverId]) { YM.toast('Open a server first.'); return null; }
    const everyone = new Set(EVERYONE_DEFAULTS.filter((k) => !s.servers[serverId].everyone_perms || s.servers[serverId].everyone_perms[k] !== false));
    return YM.modal.open({
      title: 'Roles and permissions',
      subtitle: s.servers[serverId].name,
      wide: true,
      body: [
        h('div', { class: 'ym-sub' }, '@everyone'),
        h('div', { class: 'ym-perm-list' }, [...everyone].map((k) => h('span', { class: 'ym-perm', title: k }, (ALL_KEYS.includes(k) && GROUPS.flatMap(([, l]) => l).find(([x]) => x === k)[1]) || k))),
        roles.map((r) => [
          h('div', { class: 'ym-sub' }, h('span', { class: 'ym-chip' }, h('i', { style: { background: r.color || '' } }), r.name)),
          h('div', { class: 'ym-perm-list' }, (() => {
            const own = GROUPS.flatMap(([, l]) => l).filter(([k]) => roleHas(r, k));
            return own.length ? own.map(([k, label]) => h('span', { class: 'ym-perm' + (DANGER.has(k) ? ' danger' : ''), title: k }, label)) : h('span', { class: 'ym-hint' }, 'No extra permissions.');
          })()),
        ]),
      ],
    });
  }

  YM.definePlugin({
    name: 'PermissionsViewer',
    description: 'Adds "Permissions" to a profile card (what the member can do in the open server) and "Roles and permissions" to the server menu. Calculated from the roles Yapper already loaded; channel-specific overrides are not included.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Servers', 'Utility'],
    api: { effective, roleHas, GROUPS },
    start(ctx) {
      const h = YM.dom.h;
      const sync = () => {
        const s = YM.Store.getState();
        if (!s) return;
        document.querySelectorAll('.server-menu').forEach((menu) => {
          if (menu.querySelector('.ym-pv-item') || !s.activeServerId) return;
          const id = s.activeServerId;
          menu.append(h('button', { type: 'button', class: 'ym-pv-item', onClick: () => {
            const overlay = menu.closest('.overlay');
            if (overlay) overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            openServer(id);
          } }, h('span', {}, 'Roles and permissions')));
        });
        document.querySelectorAll('.profile-card .pc2-head').forEach((head) => {
          const serverId = s.activeServerId;
          const userId = s.profileCard;
          const btn = head.querySelector('.ym-pv-btn');
          if (!serverId || !userId || typeof userId !== 'string' || !(s.serverMembers[serverId] || []).includes(userId)) { if (btn) btn.remove(); return; }
          if (btn && btn.getAttribute('data-user') === userId) return;
          if (btn) btn.remove();
          head.append(h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-pv-btn', 'data-user': userId, onClick: () => openMember(serverId, userId) }, 'Permissions'));
        });
      };
      ctx.onMutate(sync);
      ctx.on('store:change', (st, p) => { if (st.profileCard !== p.profileCard) sync(); });
      sync();
      ctx.cleanup(() => document.querySelectorAll('.ym-pv-item,.ym-pv-btn').forEach((n) => n.remove()));
      ctx.css('.ym-pv-btn{margin-top:8px}');
    },
  });
})();
