// NoSystemBadge (port): no unread count on the taskbar / dock icon. The tab title still shows the count.
(function () {
  YM.definePlugin({
    name: 'NoSystemBadge',
    description: 'Disables the unread count badge on the taskbar icon.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Notifications'],
    start(ctx) {
      YM.media.badgeEnabled = false;
      YM.media.setBadge(YM.media.badge);
      ctx.cleanup(() => {
        YM.media.badgeEnabled = true;
        YM.media.setBadge(YM.media.badge);
      });
    },
  });
})();
