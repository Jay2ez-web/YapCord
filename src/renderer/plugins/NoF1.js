// NoF1: prevent the browser's default F1 help action while YapCord is focused.
// Behavior adapted from the feature in Vencord; no upstream bundle patches are used.
(() => {
  YM.definePlugin({
    name: 'NoF1',
    description: 'Disable the F1 browser-help shortcut while this YapCord window is focused.',
    authors: ['YapCord contributors'],
    tags: ['Accessibility', 'Utility'],
    enabledByDefault: false,
    start(ctx) {
      const onKeyDown = (event) => {
        if (event.key !== 'F1' || event.defaultPrevented) return;
        event.preventDefault();
      };
      window.addEventListener('keydown', onKeyDown, true);
      ctx.cleanup(() => window.removeEventListener('keydown', onKeyDown, true));
    },
  });
})();
