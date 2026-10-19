// BiggerStreamPreview (port): hover a stream preview to see it big.
(function () {
  YM.definePlugin({
    name: 'BiggerStreamPreview',
    description: 'Hover a screen share preview (the small picture of someone\'s stream) to see a much bigger version of it.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Voice', 'Appearance'],
    options: {
      width: { type: 'slider', default: 640, min: 320, max: 1280, step: 20, description: 'Width of the big preview (pixels)' },
    },
    start(ctx) {
      let pop = null;
      const hide = () => { if (pop) { pop.remove(); pop = null; } };
      const move = (e) => {
        if (!pop) return;
        const w = pop.offsetWidth || Number(ctx.settings.store.width);
        const hgt = pop.offsetHeight || 0;
        pop.style.left = Math.max(8, Math.min(e.clientX + 18, window.innerWidth - w - 8)) + 'px';
        pop.style.top = Math.max(8, Math.min(e.clientY + 18, window.innerHeight - hgt - 8)) + 'px';
      };
      const over = (e) => {
        const img = e.target instanceof Element ? e.target.closest('.stream-card img.stream-thumb') : null;
        if (!img || !img.src) { return; }
        hide();
        pop = YM.dom.h('img', { class: 'ym-bsp', src: img.src, alt: '', style: { width: Math.min(Number(ctx.settings.store.width), window.innerWidth - 24) + 'px' } });
        document.body.append(pop);
        move(e);
      };
      const out = (e) => { if (e.target instanceof Element && e.target.closest('.stream-card')) hide(); };
      document.addEventListener('mouseover', over, true);
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseout', out, true);
      ctx.cleanup(() => {
        document.removeEventListener('mouseover', over, true);
        document.removeEventListener('mousemove', move, true);
        document.removeEventListener('mouseout', out, true);
        hide();
      });
      ctx.css('.ym-bsp{position:fixed;z-index:2147482000;pointer-events:none;border-radius:10px;box-shadow:0 10px 36px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.12);background:#000;max-height:80vh;object-fit:contain}');
    },
  });
})();
