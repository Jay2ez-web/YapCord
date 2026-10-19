// QuickReply (port): Ctrl+Up / Ctrl+Down in the message box moves the reply target; Ctrl+Shift+Up / Down picks your own message to edit.
(function () {
  function candidates(channelId, own) {
    const me = YM.Store.myId();
    return YM.Store.messages(channelId).filter((m) => m && m.id && !m.pending && !String(m.id).startsWith('tmp') && (own ? m.author_id === me : true));
  }

  /** Index math, kept pure for tests: move one step up (older) or down (newer) from `current`; null past the newest. */
  function step(list, currentId, dir) {
    if (!list.length) return null;
    const i = list.findIndex((m) => m.id === currentId);
    if (dir < 0) return list[i < 0 ? list.length - 1 : Math.max(0, i - 1)];
    if (i < 0) return null;
    return i + 1 < list.length ? list[i + 1] : null;
  }

  function scrollTo(id) {
    const row = document.querySelector('.msg[data-message-id="' + CSS.escape(id) + '"]');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }

  YM.definePlugin({
    name: 'QuickReply',
    description: 'Ctrl+Up/Down in the message box picks the message to reply to; Ctrl+Shift+Up/Down picks one of your own messages to edit.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Utility'],
    api: { step },
    start(ctx) {
      const onKey = (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        const ta = e.target;
        if (!(ta instanceof HTMLTextAreaElement) || !ta.closest('.composer')) return;
        const s = YM.Store.getState();
        const ch = s && s.activeChannelId;
        if (!ch) return;
        const dir = e.key === 'ArrowUp' ? -1 : 1;
        if (e.shiftKey) {
          const mine = candidates(ch, true);
          const next = step(mine, s.editingId, dir);
          if (!next && dir > 0) YM.Store.setState({ editingId: null });
          else if (next) { YM.Store.setState({ editingId: next.id }); scrollTo(next.id); }
        } else {
          const all = candidates(ch, false);
          const cur = s.replyingTo && s.replyingTo.channelId === ch ? s.replyingTo.messageId : null;
          const next = step(all, cur, dir);
          if (!next && dir > 0) YM.Store.setState({ replyingTo: null });
          else if (next) { YM.Store.setState({ replyingTo: { channelId: ch, messageId: next.id } }); scrollTo(next.id); }
        }
        e.preventDefault();
        e.stopPropagation();
      };
      document.addEventListener('keydown', onKey, true);
      ctx.cleanup(() => document.removeEventListener('keydown', onKey, true));
    },
  });
})();
