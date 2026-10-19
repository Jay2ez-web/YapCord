// ServerInfo (port): "Server info" in the server menu: owner, creation date, members, channels, roles, emojis.
(function () {
  function collect(serverId) {
    const s = YM.Store.getState();
    const server = s && s.servers && s.servers[serverId];
    if (!server) return null;
    const channels = Object.values(s.channels).filter((c) => c.server_id === serverId);
    const emojis = Object.values(s.emojis || {}).filter((e) => e && (e.server_id === serverId));
    const members = (s.serverMembers && s.serverMembers[serverId]) || [];
    return {
      server,
      owner: server.owner_id,
      text: channels.filter((c) => c.kind === 'text').length,
      voice: channels.filter((c) => c.kind === 'voice').length,
      roles: ((s.roles && s.roles[serverId]) || []).filter((r) => !r.auto || r.auto === 'none').length,
      members: (s.memberCounts && s.memberCounts[serverId]) || members.length,
      loadedMembers: members.length,
      emojis: emojis.length,
      categories: Object.values(s.categories || {}).filter((c) => c && c.server_id === serverId).length,
    };
  }

  function open(serverId) {
    const h = YM.dom.h;
    const d = collect(serverId);
    if (!d) { YM.toast('This server is not loaded.', { type: 'error' }); return null; }
    const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' }) : 'unknown');
    const rows = [
      ['Name', d.server.name],
      ['Server id', d.server.id],
      ['Owner', d.owner ? YM.Store.displayName(d.owner) + ' (@' + ((YM.Store.profile(d.owner) || {}).username || '?') + ')' : 'unknown'],
      ['Created', when(d.server.created_at)],
      ['Members', String(d.members)],
      ['Text channels', String(d.text)],
      ['Voice channels', String(d.voice)],
      ['Roles', String(d.roles)],
      ['Custom emojis', String(d.emojis)],
    ];
    if (d.server.description) rows.splice(1, 0, ['Description', d.server.description]);
    return YM.modal.open({
      title: 'Server info',
      subtitle: d.server.name,
      body: h('dl', { class: 'ym-kv' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      buttons: [{ label: 'Copy server id', onClick: async () => { YM.toast((await YM.util.copyText(d.server.id)) ? 'Server id copied.' : 'Could not copy.'); } }],
    });
  }

  YM.definePlugin({
    name: 'ServerInfo',
    description: 'Adds "Server info" to the menu of a server (click the server name): owner, creation date, members, channels, roles and emojis.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Servers', 'Utility'],
    api: { collect, open },
    start(ctx) {
      const sync = () => {
        document.querySelectorAll('.server-menu').forEach((menu) => {
          if (menu.querySelector('.ym-si-item')) return;
          const s = YM.Store.getState();
          if (!s || !s.activeServerId) return;
          const id = s.activeServerId;
          menu.append(YM.dom.h('button', { type: 'button', class: 'ym-si-item', onClick: () => {
            const overlay = menu.closest('.overlay');
            if (overlay) overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            open(id);
          } }, YM.dom.h('span', {}, 'Server info')));
        });
      };
      ctx.onMutate(sync);
      sync();
      ctx.cleanup(() => document.querySelectorAll('.ym-si-item').forEach((n) => n.remove()));
    },
  });
})();
