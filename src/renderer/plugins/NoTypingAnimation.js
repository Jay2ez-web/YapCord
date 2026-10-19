// NoTypingAnimation (port): the typing dots stay still.
(function () {
  YM.definePlugin({
    name: 'NoTypingAnimation',
    description: 'Stops the animated typing dots (saves a bit of CPU/GPU).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Appearance', 'Performance'],
    start(ctx) {
      ctx.css('.typing-dots i{animation:none!important;opacity:.7}');
    },
  });
})();
