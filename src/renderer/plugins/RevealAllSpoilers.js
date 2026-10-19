// RevealAllSpoilers (port): Ctrl+click a spoiler to reveal every spoiler in that message; Ctrl+Shift+click for the whole chat.
(function () {
  YM.definePlugin({
    name: 'RevealAllSpoilers',
    description: 'Ctrl+click a spoiler to reveal all spoilers in the message, Ctrl+Shift+click for the whole chat.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat'],
    start(ctx) {
      function onClick(e) {
        if (!e.ctrlKey) return;
        const t = e.target instanceof Element ? e.target.closest('.md-spoiler') : null;
        if (!t) return;
        const scope = e.shiftKey ? t.closest('.main') || document : t.closest('.msg') || document;
        scope.querySelectorAll('.md-spoiler:not(.open)').forEach((s) => {
          if (s !== t) s.click();
        });
      }
      document.addEventListener('click', onClick, true);
      ctx.cleanup(() => document.removeEventListener('click', onClick, true));
    },
  });
})();
