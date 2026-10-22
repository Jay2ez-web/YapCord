// NoMiddleClickPaste: prevent Linux primary-selection paste triggered by a middle click.
// Behavior inspired by Vencord's NoMiddleClickPaste; this uses YapCord's own plugin lifecycle.
(() => {
  YM.definePlugin({
    name: 'NoMiddleClickPaste',
    description: 'Disable middle-click primary-selection paste on Linux.',
    authors: ['YapCord contributors'],
    tags: ['Accessibility', 'Utility'],
    enabledByDefault: false,
    start(ctx) {
      const platform = String((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '');
      if (!/linux/i.test(platform)) return;
      const onMouseUp = (event) => {
        if (event.button === 1) event.preventDefault();
      };
      window.addEventListener('mouseup', onMouseUp);
      ctx.cleanup(() => window.removeEventListener('mouseup', onMouseUp));
    },
  });
})();
