// OnePingPerDM (port): while a DM already has unread messages, further messages in it don't ping again
// (no sound, no desktop notification). The unread counter and badges still update.
//
// Yapper plays the message sound via Web Audio and raises `new Notification(title, { tag: <message id> })` right after
// the realtime INSERT. Our WebSocket listener sees the frame *before* Yapper does, so the unread state we read is
// still the state from before this message.

(function () {
  YM.definePlugin({
    name: 'OnePingPerDM',
    description: 'Only ping once for a DM that already has unread messages.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Notifications', 'Chat'],
    enabledByDefault: true,
    options: {
      channelToAffect: {
        type: 'select',
        default: 'both',
        description: 'Which chats this applies to',
        options: [
          { label: 'Direct messages and group chats', value: 'both' },
          { label: 'Direct messages only', value: 'user_dm' },
          { label: 'Group chats only', value: 'group_dm' },
        ],
      },
      allowMentions: { type: 'boolean', default: false, description: 'Still ping when someone @mentions me' },
      allowEveryone: { type: 'boolean', default: false, description: 'Still ping for @everyone / @here' },
    },

    start(ctx) {
      const S = YM.Store;
      const s = ctx.settings.store;
      const mutedIds = new Set(); // message ids whose notification must be dropped

      // Yapper stores mentions as <@userId>; "@username" in the composer is converted when the message is sent.
      function mentionsMe(content) {
        const id = S.myId();
        return !!id && typeof content === 'string' && content.includes('<@' + id + '>');
      }

      ctx.on('ws:event', (event, payload) => {
        if (event !== 'message' || !payload || payload.table !== 'messages' || payload.operation !== 'INSERT') return;
        if (!S.isReady) return;
        const rec = payload.record;
        if (!rec || !rec.channel_id || rec.author_id === S.myId()) return;
        const ch = S.channel(rec.channel_id);
        if (!ch || ch.server_id) return; // servers are not affected
        const kind = ch.kind === 'group' ? 'group_dm' : 'user_dm';
        if (s.channelToAffect !== 'both' && s.channelToAffect !== kind) return;
        const st = S.getState();
        if (!((st.unread[rec.channel_id] || 0) > 0)) return; // first unread message pings normally
        if (s.allowMentions && mentionsMe(rec.content)) return;
        if (s.allowEveryone && typeof rec.content === 'string' && /(?<![\w@])@(everyone|here)\b/i.test(rec.content)) return;
        mutedIds.add(rec.id);
        if (mutedIds.size > 100) mutedIds.delete(mutedIds.values().next().value);
        YM.media.muteMessageSound(2000);
      });

      ctx.cleanup(YM.media.onNotification((_title, options) => {
        if (options && options.tag && mutedIds.has(options.tag)) return false;
        return undefined;
      }));
    },
  });
})();
