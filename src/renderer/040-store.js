// Access to Yapper's own state store (a zustand-style store). Found by the names it exports.

const STORE_NAMES = ['useStore', 'setState', 'getState', 'upsertMessages', 'removeMessage'];
const ready = YM.deferred();

const Store = (YM.Store = {
  api: null,
  hook: null,
  ready: ready.promise,
  isReady: false,

  getState() {
    return Store.api ? Store.api.getState() : null;
  },
  setState(partial) {
    if (!Store.api) throw new Error('Yapper store is not ready yet');
    return Store.api.setState(partial);
  },
  subscribe(fn) {
    if (!Store.hook) throw new Error('Yapper store is not ready yet');
    return Store.hook.subscribe(fn);
  },

  me() {
    const s = Store.getState();
    return s && s.userId ? s.profiles[s.userId] || null : null;
  },
  myId() {
    const s = Store.getState();
    return s ? s.userId : null;
  },
  profile(id) {
    const s = Store.getState();
    return s ? s.profiles[id] || null : null;
  },
  channel(id) {
    const s = Store.getState();
    return s ? s.channels[id] || null : null;
  },
  /** DMs and group chats have no server. */
  isDmChannel(channelId) {
    const c = Store.channel(channelId);
    return !!c && !c.server_id;
  },
  activeChannelId() {
    const s = Store.getState();
    return s ? s.activeChannelId : null;
  },
  messages(channelId) {
    const s = Store.getState();
    return (s && s.messages[channelId]) || [];
  },
  /** Look a message up by id: the open channel first, then everything else that is loaded. */
  findMessage(id) {
    const s = Store.getState();
    if (!s || !id) return null;
    const active = s.messages[s.activeChannelId];
    if (active) {
      const m = active.find((x) => x.id === id);
      if (m) return m;
    }
    for (const list of Object.values(s.messages)) {
      if (!Array.isArray(list)) continue;
      const m = list.find((x) => x.id === id);
      if (m) return m;
    }
    return (s.extraMessages && s.extraMessages[id]) || null;
  },
  displayName(userId) {
    const p = Store.profile(userId);
    return p ? p.display_name || p.username || 'Unknown' : 'Unknown';
  },
  /** Yapper's chat actions module: markRead, sendMessage, editMessage, deleteMessage, openDmWith, ... (null if not found). */
  live() {
    return YM.finder.findExports(['markRead', 'sendMessage', 'deleteMessage', 'dispatchLive']);
  },
  /** Open Yapper's settings modal (same as the gear button). `tab` is one of Yapper's own tab ids, e.g. "profile". */
  openSettings(tab) {
    Store.setState({ settingsAt: tab || 'open' });
  },
  closeSettings() {
    Store.setState({ settingsAt: null });
  },
});

(async () => {
  const api = await YM.finder.waitFor(STORE_NAMES, { interval: 200 });
  Store.api = api;
  Store.hook = api.useStore;
  Store.isReady = true;
  try {
    Store.hook.subscribe((state, prev) => YM.Events.emit('store:change', state, prev));
  } catch (err) {
    YM.log.error('could not subscribe to the Yapper store', err);
  }
  YM.log.info('Yapper store found');
  ready.resolve(api);
  YM.Events.emit('store:ready', api);
})();
