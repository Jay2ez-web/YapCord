// Mention Highlighting (native): visually emphasize messages containing your mentions or @everyone.
(function () {
  const ATTR = 'data-ym-mh';

  YM.definePlugin({
    name: 'Mention Highlighting',
    description: 'Visually emphasize messages containing your mentions or @everyone.',
    authors: ['YapCord'],
    tags: ['Chat', 'Notifications'],
    enabledByDefault: false,
    start(ctx) {
      const words = () => {
        const out = ['@everyone', '@here'];
        try {
          const s = YM.Store.getState();
          const me = s && s.userId;
          if (me) {
            out.push('<@' + me + '>');
            const p = s.profiles && s.profiles[me];
            if (p && p.username) out.push('@' + p.username);
          }
        } catch (_) { /* ignore */ }
        return out;
      };
      const sync = () => {
        const list = words().map((w) => w.toLowerCase());
        document.querySelectorAll('div.msg[data-message-id]').forEach((m) => {
          const t = (m.innerText || '').toLowerCase();
          m.toggleAttribute(ATTR, list.some((w) => w.length > 1 && t.includes(w)));
        });
      };
      sync();
      const offMut = YM.dom.onMutate(sync);
      const offStore = YM.Events.on('store:change', (st, prev) => {
        if (st.messages !== prev.messages || st.profiles !== prev.profiles) sync();
      });
      ctx.cleanup(() => {
        try { offMut && offMut(); } catch (_) {}
        try { offStore && offStore(); } catch (_) {}
        document.querySelectorAll('[' + ATTR + ']').forEach((n) => n.removeAttribute(ATTR));
      });
      ctx.css(`
div.msg[${ATTR}]{background:color-mix(in srgb,var(--accent) 12%,transparent)!important;border-radius:8px}
`);
    },
  });
})();
