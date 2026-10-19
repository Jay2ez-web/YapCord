// CharacterCounter (port): shows how many characters you typed, coloured as you approach the limit.
(function () {
  const DEFAULT_MAX = 2000;
  YM.definePlugin({
    name: 'CharacterCounter',
    description: 'Shows a character counter in the message box that turns yellow and red near the limit.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Utility'],
    options: {
      alwaysShow: { type: 'boolean', default: false, description: 'Always show the counter (otherwise only from 50% of the limit)' },
    },
    start(ctx) {
      const h = YM.dom.h;
      const counter = h('span', { class: 'ym-cc', 'aria-live': 'off', hidden: true });
      let current = null;

      function update() {
        const ta = document.querySelector('.composer textarea');
        if (!ta) {
          counter.hidden = true;
          return;
        }
        const host = ta.closest('.composer');
        if (host && counter.parentNode !== host) host.append(counter);
        current = ta;
        const max = ta.maxLength > 0 ? ta.maxLength : DEFAULT_MAX;
        const len = Array.from(ta.value).length;
        const show = len > 0 && (ctx.settings.store.alwaysShow || len >= max * 0.5);
        counter.hidden = !show;
        counter.textContent = len + ' / ' + max;
        counter.dataset.level = len > max ? 'over' : len >= max * 0.9 ? 'high' : len >= max * 0.75 ? 'warn' : 'ok';
      }

      const onInput = (e) => {
        if (e.target instanceof Element && e.target.matches('.composer textarea')) update();
      };
      document.addEventListener('input', onInput, true);
      ctx.cleanup(() => document.removeEventListener('input', onInput, true));
      ctx.watch('.composer textarea', update);
      ctx.interval(update, 300); // the box is cleared programmatically after sending, which fires no event
      ctx.cleanup(ctx.settings.onChange(update));
      ctx.cleanup(() => {
        counter.remove();
        current = null;
      });
      ctx.css(`
.composer{position:relative}
.ym-cc{position:absolute;right:14px;bottom:-16px;font-size:11px;font-weight:600;color:var(--text-muted);pointer-events:none;font-variant-numeric:tabular-nums}
.ym-cc[data-level=warn]{color:var(--warning)}.ym-cc[data-level=high]{color:#ff9f43}.ym-cc[data-level=over]{color:var(--danger)}
`);
    },
  });
})();
