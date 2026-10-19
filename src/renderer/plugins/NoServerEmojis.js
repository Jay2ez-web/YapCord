// NoServerEmojis (port): custom (server) emojis are left out of the emoji suggestions you get while typing :name.
(function () {
  YM.definePlugin({
    name: 'NoServerEmojis',
    description: 'Hides custom server emojis in the suggestion list that appears when you type :name (normal emojis stay).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat'],
    start(ctx) {
      ctx.css('.mention-menu button[role="option"]:has(img.emoji-ac-img[src*="/emojis/"]){display:none!important}');
    },
  });
})();
