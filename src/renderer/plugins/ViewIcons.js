// ViewIcons (port): Ctrl+click an avatar to open it full size in Yapper's picture viewer.
(function () {
  YM.definePlugin({
    name: 'ViewIcons',
    description: 'Ctrl+click any avatar to view it full size in Yapper\'s picture viewer (with zoom).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Appearance', 'Utility'],
    start(ctx) {
      const onClick = (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.button !== 0 || !(e.target instanceof Element)) return;
        const img = e.target.closest('.avatar, .profile-card-avatar, .pc2-avatar')?.querySelector('img');
        if (!img || !img.src) return;
        e.preventDefault();
        e.stopPropagation();
        YM.Store.setState({ lightbox: img.currentSrc || img.src });
      };
      document.addEventListener('click', onClick, true);
      ctx.cleanup(() => document.removeEventListener('click', onClick, true));
    },
  });
})();
