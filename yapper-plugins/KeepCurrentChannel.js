// KeepCurrentChannel (port): after a restart or reload, Yapper opens the chat you were in.
(function () {
  YM.definePlugin({
    name: 'KeepCurrentChannel',
    description: 'Reopens the chat or channel you were in when you start or reload Yapper.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Utility', 'Servers'],
    start(ctx) {
      const actions = YM.finder.lazy(['openChannel', 'sendMessage']);
      // stored as the plugin's hidden value "last" (it is not an option on screen)
      const remember = (s) => {
        const id = s.activeChannelId;
        if (id && s.channels[id]) ctx.settings.set('last', { channelId: id, serverId: s.channels[id].server_id || null });
      };
      let restored = false;
      const tryRestore = () => {
        if (restored) return;
        const s = YM.Store.getState();
        const last = ctx.settings.store.last;
        if (!s || !last || !last.channelId) { restored = true; return; }
        if (s.activeChannelId) { restored = true; return; }
        if (!s.userId || !s.channels[last.channelId]) return; // not loaded yet: try again at the next change
        const mod = actions();
        if (!mod) return;
        restored = true;
        try {
          if (s.channels[last.channelId].server_id) YM.Store.setState({ activeServerId: s.channels[last.channelId].server_id });
          Promise.resolve(mod.openChannel(last.channelId)).catch((err) => ctx.log.warn('could not reopen the chat', err));
        } catch (err) {
          ctx.log.warn('could not reopen the chat', err);
        }
      };
      ctx.on('store:change', (s, p) => {
        if (!restored) { tryRestore(); return; }
        if (s.activeChannelId !== p.activeChannelId) remember(s);
      });
      // Give up after a while: a person who deliberately opened something else must not be pulled away from it.
      ctx.timeout(() => { restored = true; }, 20000);
      YM.Store.ready.then(() => tryRestore());
    },
  });
})();
