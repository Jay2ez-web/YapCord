// Notification Rules (native): highlight messages matching your local comma-separated keyword list.
(function () {
  const ATTR = 'data-ym-keyword-hit';

  YM.definePlugin({
    name: 'Notification Rules',
    description: 'Highlight messages matching your local comma-separated keyword list.',
    authors: ['YapCord'],
    tags: ['Chat', 'Notifications'],
    options: {
      keywords: { type: 'string', default: '', description: 'Comma-separated keywords to highlight' },
    },
    start(ctx) {
      const parseKeywords = () => String(ctx.settings.store.keywords || '')
        .split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      let keys = parseKeywords();
      const syncMessage = ({ el }) => {
        if (!el) return;
        const text = (el.textContent || '').toLowerCase();
        el.toggleAttribute(ATTR, keys.length > 0 && keys.some((k) => text.includes(k)));
      };
      ctx.cleanup(YM.messages.decorate(syncMessage));
      ctx.cleanup(ctx.settings.onChange(() => {
        keys = parseKeywords();
        YM.messages.forEachVisible(syncMessage);
      }));
      ctx.cleanup(() => {
        document.querySelectorAll('[' + ATTR + ']').forEach((n) => n.removeAttribute(ATTR));
      });
      ctx.css(`
div.msg[${ATTR}]{background:color-mix(in srgb,#f5b301 14%,transparent)!important;border-radius:8px}
`);
    },
  });
})();
