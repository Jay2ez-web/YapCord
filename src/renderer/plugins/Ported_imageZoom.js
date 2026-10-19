// Image Zoom (native): hold Ctrl or Shift and scroll over an image to zoom; double-click resets.
(function () {
  YM.definePlugin({
    name: 'Image Zoom',
    description: 'Hold Ctrl or Shift and scroll over an image to zoom.',
    authors: ['YapCord'],
    tags: ['Chat', 'Utility'],
    enabledByDefault: false,
    start(ctx) {
      const bound = new Set();
      const onWheel = (e) => {
        if (!e.ctrlKey && !e.shiftKey) return;
        const img = e.target.closest ? e.target.closest('img') : null;
        if (!img || !bound.has(img)) return;
        e.preventDefault();
        const next = Math.min(3, Math.max(1, (Number(img.dataset.ymScale) || 1) + (e.deltaY < 0 ? 0.15 : -0.15)));
        img.dataset.ymScale = String(next);
        img.style.transform = 'scale(' + next + ')';
        img.style.transformOrigin = 'center';
      };
      const onDbl = (e) => {
        const img = e.target.closest ? e.target.closest('img') : null;
        if (!img || !bound.has(img)) return;
        delete img.dataset.ymScale;
        img.style.transform = '';
      };
      const bind = (root) => {
        const imgs = [];
        if (root.tagName === 'IMG') imgs.push(root);
        if (root.querySelectorAll) imgs.push(...root.querySelectorAll('img'));
        for (const img of imgs) bound.add(img);
      };
      bind(document);
      document.addEventListener('wheel', onWheel, { passive: false });
      document.addEventListener('dblclick', onDbl);
      const offMut = YM.dom.onMutate(bind);
      ctx.cleanup(() => {
        document.removeEventListener('wheel', onWheel);
        document.removeEventListener('dblclick', onDbl);
        try { offMut && offMut(); } catch (_) {}
        for (const img of bound) {
          if (img.isConnected) {
            delete img.dataset.ymScale;
            img.style.transform = '';
          }
        }
        bound.clear();
      });
    },
  });
})();
