// ReplyPingDot: a clear red dot on the server and on the chat when someone replies to you, pings you or sends you a DM.
// The dot stays until you open that chat. It only looks at messages that arrive while YapCord is running.
(function () {
  /** Why a new message is for you: 'reply', 'ping', 'dm' or null. */
  function reasonFor(message, state, opts) {
    if (!message || !state) return null;
    const me = state.userId;
    if (!me || message.author_id === me) return null;
    const channel = state.channels && state.channels[message.channel_id];
    if (!channel) return null;
    if (opts.reply && message.reply_to_id) {
      const target = YM.Store.findMessage(message.reply_to_id);
      if (target && target.author_id === me) return 'reply';
    }
    const text = String(message.content || '');
    const mine = state.profiles && state.profiles[me];
    if (opts.ping) {
      if (text.includes('<@' + me + '>')) return 'ping';
      if (mine && mine.username && new RegExp('(^|[^\\p{L}\\p{N}_])@' + String(mine.username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}_])', 'iu').test(text)) return 'ping';
      if (opts.everyone && /(^|\s)@(everyone|here)(?![\p{L}\p{N}_])/iu.test(text)) return 'ping';
    }
    if (opts.dm && !channel.server_id) return 'dm';
    return null;
  }

  YM.definePlugin({
    name: 'ReplyPingDot',
    description: 'Shows a dot (amber for replies, red for pings and DMs) on the server and the chat when someone replies to you, pings you or DMs you. It stays until you open that chat.',
    authors: ['YapCord'],
    tags: ['Notifications', 'Servers', 'Chat'],
    api: { reasonFor },
    options: {
      reply: { type: 'boolean', default: true, description: 'When someone replies to one of your messages' },
      ping: { type: 'boolean', default: true, description: 'When someone mentions you with @' },
      everyone: { type: 'boolean', default: false, description: 'Also for @everyone and @here' },
      dm: { type: 'boolean', default: true, description: 'When someone sends you a direct message' },
      muted: { type: 'boolean', default: false, description: 'Also in chats and servers you muted' },
    },
    start(ctx) {
      const h = YM.dom.h;
      const attention = new Map(); // channelId -> 'reply' | 'ping' | 'dm'
      const seen = new Set();
      const label = { reply: 'Someone replied to you', ping: 'You were mentioned', dm: 'New direct message' };

      const remember = () => {
        const s = YM.Store.getState();
        if (!s) return;
        for (const list of Object.values(s.messages || {})) if (Array.isArray(list)) for (const m of list) seen.add(m.id);
      };

      const scan = (state) => {
        const opts = ctx.settings.store;
        let changed = false;
        for (const [channelId, list] of Object.entries(state.messages || {})) {
          if (!Array.isArray(list)) continue;
          for (let i = list.length - 1; i >= 0 && i >= list.length - 8; i--) {
            const m = list[i];
            if (!m || seen.has(m.id)) continue;
            seen.add(m.id);
            if (m.pending || m.status === 'sending') continue;
            if (channelId === state.activeChannelId && !document.hidden) continue;
            const ch = state.channels && state.channels[channelId];
            if (!opts.muted && ((state.muted && state.muted[channelId]) || (ch && ch.server_id && state.mutedServers && state.mutedServers[ch.server_id]))) continue;
            const why = reasonFor(m, state, opts);
            if (why && attention.get(channelId) !== why) { attention.set(channelId, why); changed = true; }
          }
        }
        if (changed) paint();
      };

      const clear = (state) => {
        const id = state.activeChannelId;
        if (id && attention.has(id) && !document.hidden) { attention.delete(id); paint(); }
      };

      const serverOf = (channelId) => { const s = YM.Store.getState(); const ch = s && s.channels && s.channels[channelId]; return ch && ch.server_id || null; };

      function paint() {
        const want = new Map(); // element -> reason
        const s = YM.Store.getState();
        if (!s) return;
        const byServer = new Map();
        let dm = null;
        for (const [channelId, why] of attention) {
          const sid = serverOf(channelId);
          if (sid) byServer.set(sid, why); else dm = why;
          for (const row of document.querySelectorAll('[data-nav-chan="' + CSS.escape(channelId) + '"]')) want.set(row, why);
        }
        const rail = document.querySelector('nav.rail');
        if (rail) {
          for (const btn of rail.querySelectorAll('button.rail-item:not(.rail-folder):not(.add)')) {
            if (btn.matches('[aria-label="Direct messages"]')) { if (dm) want.set(btn, dm); continue; }
            const sid = YM.people.serverIdOf(btn);
            if (sid && byServer.has(sid)) want.set(btn, byServer.get(sid));
          }
        }
        for (const dot of document.querySelectorAll('.ym-rpd')) {
          const host = dot.parentElement;
          if (!want.has(host)) dot.remove();
        }
        for (const [host, why] of want) {
          let dot = host.querySelector(':scope > .ym-rpd');
          if (!dot) { dot = h('span', { class: 'ym-rpd', 'aria-label': label[why] }); host.append(dot); }
          if (dot.getAttribute('data-why') !== why) { dot.setAttribute('data-why', why); dot.title = label[why]; dot.setAttribute('aria-label', label[why]); }
        }
      }

      remember();
      ctx.css(`
.ym-rpd{position:absolute;top:2px;right:2px;width:12px;height:12px;border-radius:50%;background:#f2555a;box-shadow:0 0 0 2px var(--bg-rail,#141519),0 0 8px rgba(242,85,90,.7);pointer-events:none;z-index:2}
.channel-row .ym-rpd,.chat-row .ym-rpd{top:50%;right:10px;margin-top:-5px;width:10px;height:10px;box-shadow:0 0 0 2px var(--bg-side,#1b1c21),0 0 6px rgba(242,85,90,.7)}
.ym-rpd[data-why="reply"]{background:#f59e0b}
@media (prefers-reduced-motion:no-preference){.ym-rpd{animation:ymRpd 1.8s ease-in-out infinite}@keyframes ymRpd{50%{transform:scale(1.18)}}}
`);
      ctx.on('store:change', (st, prev) => {
        if (st.messages !== prev.messages) scan(st);
        if (st.activeChannelId !== prev.activeChannelId) clear(st);
      });
      const onVis = () => { const s = YM.Store.getState(); if (s) clear(s); };
      document.addEventListener('visibilitychange', onVis);
      ctx.onMutate(() => { if (attention.size) paint(); });
      ctx.cleanup(() => { document.removeEventListener('visibilitychange', onVis); document.querySelectorAll('.ym-rpd').forEach((n) => n.remove()); attention.clear(); });
    },
  });
})();
