// UserVoiceShow (port): a small speaker icon next to the name of someone who is in a voice channel right now.
(function () {
  let voiceChannelByUser = new Map();

  function rebuildVoiceIndex() {
    const s = YM.Store.getState();
    const next = new Map();
    for (const [channelId, members] of Object.entries((s && s.voiceMembers) || {})) {
      for (const member of members || []) {
        if (member && member.userId && !next.has(member.userId)) next.set(member.userId, channelId);
      }
    }
    voiceChannelByUser = next;
  }

  function inVoice(userId) {
    return userId ? voiceChannelByUser.get(userId) || null : null;
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
      const syncMessage = ({ el, message }) => {
        const author = el && el.querySelector('.msg-author');
        if (author) mark(author, message ? inVoice(message.author_id) : null);
      };
      const syncChatRow = (row) => {
        const state = YM.Store.getState();
        const channel = state && state.channels[row.getAttribute('data-nav-chan')];
        const other = channel && channel.kind === 'dm' && Array.isArray(channel.memberIds)
          ? channel.memberIds.find((id) => id !== state.userId)
          : null;
        mark(row, other ? inVoice(other) : null);
      };
      const syncChatRows = () => document.querySelectorAll('.chat-row[data-nav-chan]').forEach(syncChatRow);
      const syncAll = () => {
        rebuildVoiceIndex();
        YM.messages.forEachVisible(syncMessage);
        syncChatRows();
      };
      ctx.cleanup(YM.messages.decorate(syncMessage));
      ctx.watch('.chat-row[data-nav-chan]', syncChatRow);
      ctx.on('store:change', (s, p) => {
        if (s.voiceMembers !== p.voiceMembers) syncAll();
        else if (s.channels !== p.channels || s.activeChannelId !== p.activeChannelId) syncChatRows();
      });
      ctx.on('store:ready', syncAll);
      syncAll();
      ctx.cleanup(() => {
        voiceChannelByUser = new Map();
        document.querySelectorAll('[data-ym-voice]').forEach((el) => { el.removeAttribute('data-ym-voice'); el.removeAttribute('title'); });
      });
      ctx.css(`
.msg-author[data-ym-voice]::after,.chat-row[data-ym-voice] .name::after{content:"\\1F50A";font-size:.8em;margin-left:5px;opacity:.85}
`);
    },
  });
})();
