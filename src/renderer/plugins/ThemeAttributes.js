// ThemeAttributes (port): adds data-attributes to Yapper's elements so theme authors can target them with CSS.
//   .msg[data-ym-author="<user id>"]   .msg[data-ym-mine]   .msg[data-ym-reply]   html[data-ym-channel="<id>"]   html[data-ym-dm]
(function () {
  YM.definePlugin({
    name: 'ThemeAttributes',
    description: 'Adds data attributes (author id, own messages, current channel) to elements so themes and Custom CSS can target them.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Developer', 'Appearance'],
    start(ctx) {
      const root = document.documentElement;
      const sync = () => {
        const ch = YM.Store.activeChannelId();
        if (ch) { root.dataset.ymChannel = ch; if (YM.Store.isDmChannel(ch)) root.dataset.ymDm = ''; else delete root.dataset.ymDm; }
        else { delete root.dataset.ymChannel; delete root.dataset.ymDm; }
      };
      ctx.cleanup(YM.messages.decorate(({ el, message }) => {
        if (!message) return;
        el.dataset.ymAuthor = message.author_id || '';
        if (message.author_id === YM.Store.myId()) el.dataset.ymMine = ''; else delete el.dataset.ymMine;
        if (message.reply_to_id) el.dataset.ymReply = message.reply_to_id; else delete el.dataset.ymReply;
      }));
      YM.Store.ready.then(() => {
        sync();
        ctx.on('store:change', (s, p) => { if (s.activeChannelId !== p.activeChannelId) sync(); });
      });
      ctx.cleanup(() => {
        delete root.dataset.ymChannel;
        delete root.dataset.ymDm;
        document.querySelectorAll('[data-ym-author]').forEach((n) => { delete n.dataset.ymAuthor; delete n.dataset.ymMine; delete n.dataset.ymReply; });
      });
    },
  });
})();
