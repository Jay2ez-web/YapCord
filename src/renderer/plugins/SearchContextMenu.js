// SearchContextMenu (port of ReplaceGoogleSearch + ReverseImageSearch): extra right-click entries in the desktop app.
// The menu itself belongs to the app window, so the work happens in the main process (src/main/search.js); this entry is the on/off switch and the options.
(function () {
  YM.definePlugin({
    name: 'SearchContextMenu',
    description: 'Adds "Search the web for ..." to selected text and "Search image with ..." to pictures in the right-click menu (desktop app only).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Utility'],
    options: {
      text: { type: 'boolean', default: true, description: 'Search selected text' },
      textEngine: {
        type: 'select', default: 'google', description: 'Search engine for text',
        options: [{ label: 'Google', value: 'google' }, { label: 'DuckDuckGo', value: 'duckduckgo' }, { label: 'Bing', value: 'bing' }, { label: 'Brave Search', value: 'brave' }],
      },
      images: { type: 'boolean', default: true, description: 'Search pictures' },
      imageEngine: {
        type: 'select', default: 'lens', description: 'Search engine for pictures',
        options: [{ label: 'Google Lens', value: 'lens' }, { label: 'TinEye', value: 'tineye' }, { label: 'Yandex', value: 'yandex' }, { label: 'SauceNAO', value: 'saucenao' }],
      },
    },
    start(ctx) {
      if (!YM.inApp) ctx.log.warn('The right-click menu only exists in the desktop app; this plugin does nothing in a browser.');
    },
  });
})();
