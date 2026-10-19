// ImageFilename (port): hover a picture or GIF in a message to see its file name. BetterGifAltText is in here too.
(function () {
  const IMG = '.msg-image img,.msg-album-cell img,.msg-linkimgs img';

  function fileName(src) {
    try {
      const u = new URL(src, location.href);
      const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
      return last.replace(/^\d{10,}[-_]/, '') || '';
    } catch (_) {
      return '';
    }
  }

  YM.definePlugin({
    name: 'ImageFilename',
    description: 'Shows the file name of a picture or GIF as a tooltip, and uses it as the alt text of GIFs (instead of just "GIF").',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Accessibility'],
    api: { fileName },
    options: {
      altText: { type: 'boolean', default: true, description: 'Also use the file name as alt text for pictures without one (or with just "GIF" / "image")' },
    },
    start(ctx) {
      const apply = ({ el }) => {
        el.querySelectorAll(IMG).forEach((img) => {
          const name = fileName(img.currentSrc || img.src || img.getAttribute('src') || '');
          if (!name) return;
          if (!img.title) img.title = name;
          if (ctx.settings.store.altText) {
            const alt = (img.getAttribute('alt') || '').trim();
            if (!alt || /^(gif|image|picture|photo)$/i.test(alt)) img.setAttribute('alt', name);
          }
        });
      };
      ctx.cleanup(YM.messages.decorate(apply));
    },
  });
})();
