// Focus Mode (native): hide the server rail and/or the channels column for a cleaner chat view.
(function () {
  YM.definePlugin({
    name: 'Focus Mode',
    description: 'Hide the server rail and navigation column for a cleaner chat view.',
    authors: ['YapCord'],
    tags: ['Appearance', 'Layout'],
    options: {
      hideRail: { type: 'boolean', default: true, description: 'Hide the server rail (icons)' },
      hideSidebar: { type: 'boolean', default: true, description: 'Hide the channels / DM column' },
    },
    start(ctx) {
      const apply = () => {
        const s = ctx.settings.store;
        ctx.css(
          (s.hideRail === false ? '' : '.app>.rail{display:none!important}\n') +
          (s.hideSidebar === false ? '' : '.app>.sidebar{display:none!important}\n'),
        );
      };
      apply();
      ctx.cleanup(ctx.settings.onChange(apply));
    },
  });
})();
