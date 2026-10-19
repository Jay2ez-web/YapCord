// MessageClickActions (port): double-click a message to edit your own or reply to someone else's.
(function () {
  const IGNORE = 'a,button,input,textarea,select,video,audio,img,.msg-editor,.md-spoiler,.reaction,.file-card,.msg-actions,.reply-preview,.mention,[contenteditable]';

  function focusComposer() {
    requestAnimationFrame(() => document.querySelector('.composer textarea')?.focus());
  }

  function act(id, mode) {
    const m = YM.Store.findMessage(id);
    if (!m || String(id).startsWith('tmp') || m.pending) return false;
    const mine = m.author_id === YM.Store.myId();
    if (mine && (mode === 'both' || mode === 'edit')) {
      YM.Store.setState({ editingId: id });
      return 'edit';
    }
    if (mode === 'both' || mode === 'reply') {
      YM.Store.setState({ replyingTo: { channelId: m.channel_id, messageId: id } });
      focusComposer();
      return 'reply';
    }
    return false;
  }

  YM.definePlugin({
    name: 'MessageClickActions',
    description: 'Double-click a message to edit it (your own messages) or reply to it (other people\'s messages).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Utility'],
    api: { act },
    options: {
      mode: {
        type: 'select', default: 'both', description: 'Double-click does',
        options: [{ label: 'Edit mine, reply to others', value: 'both' }, { label: 'Only edit my messages', value: 'edit' }, { label: 'Only reply', value: 'reply' }],
      },
    },
    start(ctx) {
      const onDbl = (e) => {
        if (!(e.target instanceof Element) || e.target.closest(IGNORE)) return;
        const row = e.target.closest('.msg[data-message-id]');
        if (!row || row.classList.contains('blocked-msg') || row.classList.contains('editing')) return;
        if (act(row.getAttribute('data-message-id'), ctx.settings.store.mode)) {
          window.getSelection && window.getSelection().removeAllRanges();
        }
      };
      document.addEventListener('dblclick', onDbl);
      ctx.cleanup(() => document.removeEventListener('dblclick', onDbl));
    },
  });
})();
