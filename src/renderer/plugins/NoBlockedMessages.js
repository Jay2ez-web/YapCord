// NoBlockedMessages (port): messages from people you blocked disappear completely (no "Blocked message / Show" row).
(function () {
  YM.definePlugin({
    name: 'NoBlockedMessages',
    description: 'Hides messages from blocked users completely instead of showing a "Blocked message" placeholder.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Privacy'],
    start(ctx) {
      ctx.css('.msg.blocked-msg{display:none!important}');
    },
  });
})();
