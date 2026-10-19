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
      const sync = () => {
        const keys = String(ctx.settings.store.keywords || '')
          .split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
        document.querySelectorAll('div.msg[data-message-id]').forEach((m) => {
          const text = (m.innerText || '').toLowerCase();
          m.toggleAttribute(ATTR, keys.length > 0 && keys.some((k) => text.includes(k)));
        });
      };
      sync();
      const offMut = YM.dom.onMutate(sync);
      const offSettings = ctx.settings.onChange(sync);
      ctx.cleanup(() => {
        try { offMut && offMut(); } catch (_) {}
        try { offSettings && offSettings(); } catch (_) {}
        document.querySelectorAll('[' + ATTR + ']').forEach((n) => n.removeAttribute(ATTR));
      });
      ctx.css(`
div.msg[${ATTR}]{background:color-mix(in srgb,#f5b301 14%,transparent)!important;border-radius:8px}
`);
    },
  });
})();
