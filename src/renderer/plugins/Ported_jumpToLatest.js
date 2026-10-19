// Jump to Latest (native): Ctrl/Cmd+Shift+L smoothly scrolls to the newest message.
(function () {
  YM.definePlugin({
    name: 'Jump to Latest',
    description: 'Press Ctrl/Cmd+Shift+L to smoothly reach the newest message.',
    authors: ['YapCord'],
    tags: ['Chat', 'Utility'],
    enabledByDefault: false,
    start(ctx) {
      const jump = () => {
        const rows = document.querySelectorAll('.msg[data-message-id]');
        const last = rows.length ? rows[rows.length - 1] : null;
        if (!last) return false;
        last.scrollIntoView({ behavior: 'smooth', block: 'end' });
        return true;
      };
      const onKey = (e) => {
        if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key.toLowerCase() !== 'l') return;
        if (jump()) e.preventDefault();
      };
      document.addEventListener('keydown', onKey, true);
      ctx.cleanup(() => document.removeEventListener('keydown', onKey, true));
    },
  });
})();
