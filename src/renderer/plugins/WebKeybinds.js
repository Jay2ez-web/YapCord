// WebKeybinds: provide the app's documented settings shortcut without overriding reserved browser/Electron chords.
// Only Ctrl/Cmd+, is handled; tabs, window creation, history and zoom remain under Electron/Yapper control.
(() => {
  YM.definePlugin({
    name: 'WebKeybinds',
    description: 'Open YapCord settings with Ctrl+, (Windows/Linux) or Command+, (macOS). Reserved browser shortcuts are unchanged.',
    authors: ['YapCord contributors'],
    tags: ['Navigation', 'Utility'],
    enabledByDefault: false,
    start(ctx) {
      const onKeyDown = (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
        if (String(event.key || '').toLowerCase() !== ',' && event.code !== 'Comma') return;
        const target = event.target;
        if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ''))) return;
        event.preventDefault();
        YM.Store.openSettings();
      };
      window.addEventListener('keydown', onKeyDown, true);
      ctx.cleanup(() => window.removeEventListener('keydown', onKeyDown, true));
    },
  });
})();
