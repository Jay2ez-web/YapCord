// UserVoiceShow (port): a small speaker icon next to the name of someone who is in a voice channel right now.
(function () {
  function inVoice(userId) {
    const s = YM.Store.getState();
    if (!s || !userId) return null;
    for (const [channelId, list] of Object.entries(s.voiceMembers || {})) {
      if ((list || []).some((m) => m.userId === userId)) return channelId;
    }
    return null;
  }

  YM.definePlugin({
    name: 'UserVoiceShow',
    description: 'Shows a speaker icon next to the name of people who are in a voice channel (in messages and your chat list).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Voice', 'Chat'],
    api: { inVoice },
    start(ctx) {
      const mark = (el, channelId) => {
        if (channelId) {
          const ch = YM.Store.channel(channelId);
          const title = 'In voice channel' + (ch && ch.name ? ': ' + ch.name : '');
          if (el.getAttribute('data-ym-voice') !== title) { el.setAttribute('data-ym-voice', title); el.setAttribute('title', title); }
        } else if (el.hasAttribute('data-ym-voice')) {
          el.removeAttribute('data-ym-voice');
          el.removeAttribute('title');
        }
      };
      const sync = () => {
        document.querySelectorAll('.msg[data-message-id] .msg-author').forEach((el) => {
          const row = el.closest('.msg');
          const m = YM.Store.findMessage(row.getAttribute('data-message-id'));
          mark(el, m ? inVoice(m.author_id) : null);
        });
        document.querySelectorAll('.chat-row[data-nav-chan]').forEach((row) => {
          const s = YM.Store.getState();
          const ch = s && s.channels[row.getAttribute('data-nav-chan')];
          const other = ch && ch.kind === 'dm' && Array.isArray(ch.memberIds) ? ch.memberIds.find((id) => id !== s.userId) : null;
          mark(row, other ? inVoice(other) : null);
        });
      };
      ctx.onMutate(sync);
      ctx.on('store:change', (s, p) => { if (s.voiceMembers !== p.voiceMembers) sync(); });
      sync();
      ctx.cleanup(() => document.querySelectorAll('[data-ym-voice]').forEach((el) => { el.removeAttribute('data-ym-voice'); el.removeAttribute('title'); }));
      ctx.css(`
.msg-author[data-ym-voice]::after,.chat-row[data-ym-voice] .name::after{content:"\\1F50A";font-size:.8em;margin-left:5px;opacity:.85}
`);
    },
  });
})();
