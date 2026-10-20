'use strict';
// YapCord inside the OFFICIAL Yapper desktop app (the way Vencord works with Discord): no second app, no second login.
//
// tools/yapper-patch.js puts a tiny stub in the Yapper install folder (resources\app\index.js). When Yapper starts, the stub
// calls install() below and then starts Yapper's own main.js unchanged. install() does not create windows, a tray or a menu
// (Yapper has those). It only
//   - registers YapCord's preload for Yapper's pages (it exposes window.YapperNative and puts the plugin runtime in the page),
//   - answers the runtime's IPC calls (settings, themes, file dialog ...), and
//   - adds the right-click menu and the tracker filter.
// Integrated mode retains its own %APPDATA%\YapCord profile; the standalone 1.0 installer uses %APPDATA%\YapCord1.0.
const fs = require('fs');
const path = require('path');
const { app, session, shell, nativeImage, net } = require('electron');

const C = require('./constants');
const log = require('./log');
const { SettingsStore } = require('./settings');
const { ThemeManager } = require('./themes');
const { NetFilter } = require('./netfilter');
const { registerIpc } = require('./ipc');
const { attachContextMenu } = require('./contextmenu');
const { AppIcon } = require('./appicon');
const { installTrayPatch } = require('./trayicon');

/** Adds `file` as a preload script for every page of `ses`. Returns which Electron API was used. */
function addPreload(ses, file) {
  if (typeof ses.registerPreloadScript === 'function') {
    ses.registerPreloadScript({ type: 'frame', filePath: file });
    return 'registerPreloadScript';
  }
  if (typeof ses.setPreloads === 'function') {
    ses.setPreloads([...(typeof ses.getPreloads === 'function' ? ses.getPreloads() : []), file]);
    return 'setPreloads';
  }
  throw new Error('this Electron version cannot add preload scripts');
}

function install() {
  const dataDir = path.join(app.getPath('appData'), 'YapCord');
  const settings = new SettingsStore(path.join(dataDir, 'settings'));
  settings.load();
  const themes = new ThemeManager(path.join(dataDir, 'themes'));
  const netfilter = new NetFilter();

  // The CustomIcons plugin (your own app / tray icon). Yapper's own icon is read from its original archive for "back to the original".
  let yapperIcon;
  const appIcon = new AppIcon({
    dir: path.join(dataDir, 'icons'),
    nativeImage,
    isEnabled: () => !!((settings.get().plugins || {}).CustomIcons || {}).enabled,
    originalWindow: () => {
      if (yapperIcon === undefined) {
        try { yapperIcon = nativeImage.createFromBuffer(fs.readFileSync(path.join(process.resourcesPath, '_app.asar', 'build', 'icon.png'))); } catch (_) { yapperIcon = null; }
        if (yapperIcon && yapperIcon.isEmpty()) yapperIcon = null;
      }
      return yapperIcon;
    },
    log,
  });
  // Yapper creates its tray later, from its own code: replace the Tray class before that code loads (see trayicon.js).
  installTrayPatch({ icon: appIcon, log });

  /** @type {Electron.BrowserWindow|null} Yapper's own (only) window. */
  let mainWin = null;
  const getWindow = () => (mainWin && !mainWin.isDestroyed() ? mainWin : null);
  const send = (channel, ...args) => {
    const w = getWindow();
    if (w) w.webContents.send(channel, ...args);
  };
  const openExternalSafe = (url) => {
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url).catch(() => undefined);
  };

  // Only what makes sense inside Yapper's own app: autostart, tray, window position ... stay Yapper's business.
  const applyWindowSettings = () => {
    const s = settings.get();
    netfilter.enabled = !(s.plugins && s.plugins.NoTrack && s.plugins.NoTrack.enabled === false);
    appIcon.refresh();
  };

  app.on('browser-window-created', (_e, win) => {
    if (getWindow()) return;
    mainWin = win;
    win.on('closed', () => {
      if (mainWin === win) mainWin = null;
    });
    attachContextMenu(win.webContents, { getWindow, settings, openExternal: openExternalSafe });
    appIcon.attachWindow(win);
  });

  process.on('uncaughtException', (err) => log.error('uncaughtException:', err));
  process.on('unhandledRejection', (err) => log.error('unhandledRejection:', err));
  app.on('will-quit', () => settings.flush());
  app.on('before-quit', () => settings.flush());

  // Registered before Yapper's own whenReady() callback runs, so the preload is in place when its window opens.
  app.whenReady().then(() => {
    log.init(path.join(dataDir, 'logs'));
    let own = '';
    try { own = require('../../package.json').version; } catch (_) { /* not copied */ }
    log.info('YapCord ' + own + ' running inside Yapper ' + app.getVersion() + ' (electron ' + process.versions.electron + ')');
    themes.ensureDir(C.BUNDLED_THEMES_DIR);
    const ses = session.defaultSession;
    netfilter.install(ses);
    applyWindowSettings();
    registerIpc({ getWindow, settings, themes, netfilter, dataDir, applyWindowSettings, mode: 'official', appIcon });
    const how = addPreload(ses, C.PRELOAD);
    log.info('preload added with ' + how);

    themes.watch(() => send('ym:themes-changed', themes.list()));
    try {
      let t = null;
      fs.watch(settings.dir, { persistent: false }, (_ev, fileName) => {
        if (fileName && fileName !== 'quickCss.css') return;
        clearTimeout(t);
        t = setTimeout(() => send('ym:quickcss-changed', settings.readQuickCss()), 200);
      });
    } catch (_) {
      /* optional */
    }
  });
}

module.exports = { install, addPreload };
