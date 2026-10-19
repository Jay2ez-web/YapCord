// Compact Navigation (native): tighter server rail and chat-list spacing, messages untouched.
(function () {
  YM.definePlugin({
    name: 'Compact Navigation',
    description: 'Reduce rail and chat-list spacing while keeping messages readable.',
    authors: ['YapCord'],
    tags: ['Appearance', 'Layout'],
    start(ctx) {
      ctx.css(`
.app>.rail{gap:2px!important;padding:6px 4px!important}
.app>.rail .rail-item{margin:1px auto!important}
.chat-row,.channel-row{padding-top:3px!important;padding-bottom:3px!important}
`);
    },
  });
})();
