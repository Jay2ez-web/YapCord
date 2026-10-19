// Final step: start themes, plugins and the settings UI once the page is ready.

YM.bootstrap = {
  started: false,
  async start() {
    if (YM.bootstrap.started) return;
    YM.bootstrap.started = true;
    YM.Events.emit('boot:start');
    try {
      YM.plugins.startEnabled();
    } catch (err) {
      YM.log.error('could not start plugins', err);
    }
    YM.domReady.then(async () => {
      try {
        await YM.themes.init();
      } catch (err) {
        YM.log.error('could not load themes', err);
      }
      YM.Events.emit('boot:ready');
    });
  },
};

// bootstrap.start() is called by the bundle after all plugins are defined (see src/main/bundle.js). Network and
// media hooks are installed while the bundle loads, i.e. before Yapper's own scripts run.

YM.openSettings = (page) => {
  if (YM.settingsUi && YM.settingsUi.open) return YM.settingsUi.open(page);
  YM.toast('Settings are still loading, try again in a second.');
};
if (YM.official) {
  // The stand-alone app has a menu with Ctrl+, ; the official Yapper app has no such menu, so listen for the shortcut here.
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === ',') {
      e.preventDefault();
      YM.openSettings();
    }
  }, true);
}
YM.log.info('YapCord ' + YM.version + ' loaded' + (YM.inApp ? '' : ' (outside the app)'));
