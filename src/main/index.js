'use strict';
const path = require('path');
const { app, BrowserWindow, Menu, Tray, nativeImage, session, shell } = require('electron');

const C = require('./constants');
const log = require('./log');
const { SettingsStore } = require('./settings');
const { ThemeManager } = require('./themes');
const { NetFilter } = require('./netfilter');
const { registerIpc } = require('./ipc');
const { installDisplayMediaHandler } = require('./capture');
const { attachContextMenu } = require('./contextmenu');
const { resolveDataDir } = require('./datadir');
const { makeRivalGuard } = require('./rival');
const { AppIcon } = require('./appicon');
const { Updater } = require('./updater');

// ---- identity & storage (must happen before 'ready') -------------------------------------------------
app.setName('YapCord');
if (process.platform === 'win32') app.setAppUserModelId('dev.yapcord.app');
// %APPDATA%\YapCord (moved over from the old %APPDATA%\YapperMod folder on the first start).
const dataLocation = resolveDataDir(app.getPath('appData'));
const dataDir = dataLocation.dir;
app.setPath('userData', dataDir);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

function main() {
  let rival = null;
  const settings = new SettingsStore(path.join(dataDir, 'settings'));
  settings.load();
  const themes = new ThemeManager(path.join(dataDir, 'themes'));
  const updater = new Updater({ currentVersion: app.getVersion(), dataDir, log });
  const netfilter = new NetFilter();
  // The CustomIcons plugin: your own app / tray icon (only used while that plugin is on).
  const appIcon = new AppIcon({
    dir: path.join(dataDir, 'icons'),
    nativeImage,
    isEnabled: () => !!((settings.get().plugins || {}).CustomIcons || {}).enabled,
    originalWindow: () => nativeImage.createFromPath(C.ICON),
    log,
  });

  if (settings.get().window.hardwareAcceleration === false) app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  /** All live YapCord windows; each shares the same login session and local settings. */
  const windows = new Set();
  /** @type {Electron.Tray|null} */
  let tray = null;
  let quitting = false;
  const startHidden = process.argv.includes('--hidden');

  const getWindows = () => [...windows].filter((w) => w && !w.isDestroyed());
  const getWindow = () => {
    const focused = BrowserWindow.getFocusedWindow();
    if (focused && windows.has(focused) && !focused.isDestroyed()) return focused;
    const live = getWindows();
    return live.length ? live[live.length - 1] : null;
  };
  const isTrustedWindow = (sender) => getWindows().some((w) => w.webContents === sender);

  function applyWindowSettings() {
    const s = settings.get();
    const w = s.window || {};
    netfilter.enabled = !(s.plugins && s.plugins.NoTrack && s.plugins.NoTrack.enabled === false);
    appIcon.refresh();
    try {
      if (process.platform === 'win32' || process.platform === 'darwin') {
        app.setLoginItemSettings({ openAtLogin: !!w.autoStart, args: w.startMinimized ? ['--hidden'] : [] });
      }
    } catch (err) {
      log.warn('could not update login item:', err);
    }
    for (const window of getWindows()) {
      try {
        window.webContents.session.setSpellCheckerEnabled(w.spellcheck !== false);
      } catch (_) {
        /* ignore */
      }
    }
  }

  const send = (channel, ...args) => {
    for (const window of getWindows()) {
      try { window.webContents.send(channel, ...args); } catch (_) { /* window is closing */ }
    }
  };
  updater.on('state', (state) => send('ym:update-state', state));

  // ---- navigation / permissions -------------------------------------------------------------------
  const isSiteUrl = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && C.SITE_HOSTS.includes(u.hostname);
    } catch (_) {
      return false;
    }
  };
  const isTrustedOrigin = (url) => {
    try {
      const h = new URL(url).hostname;
      return C.TRUSTED_HOSTS.includes(h) || h.endsWith('.yapper.website');
    } catch (_) {
      return false;
    }
  };
  const openExternalSafe = (url) => {
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url).catch(() => undefined);
  };

  const ALLOWED_PERMISSIONS = new Set([
    'media', 'audioCapture', 'videoCapture', 'display-capture', 'notifications', 'fullscreen', 'pointerLock',
    'clipboard-sanitized-write', 'clipboard-read', 'speaker-selection', 'window-management', 'idle-detection',
  ]);

  function setupSession(ses) {
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      const origin = (details && details.requestingUrl) || wc.getURL();
      callback(isTrustedOrigin(origin) && ALLOWED_PERMISSIONS.has(permission));
    });
    ses.setPermissionCheckHandler((wc, permission, requestingOrigin) =>
      isTrustedOrigin(requestingOrigin || (wc && wc.getURL()) || '') && ALLOWED_PERMISSIONS.has(permission),
    );
    netfilter.install(ses);
    installDisplayMediaHandler(ses, getWindow);
  }

  // ---- window --------------------------------------------------------------------------------------
  function createWindow(forceShow = false) {
    const w = settings.get().window || {};
    const b = w.bounds || {};
    const window = new BrowserWindow({
      width: b.width || 1280,
      height: b.height || 820,
      x: Number.isFinite(b.x) ? b.x : undefined,
      y: Number.isFinite(b.y) ? b.y : undefined,
      minWidth: 720,
      minHeight: 480,
      show: false,
      backgroundColor: '#141519',
      title: 'YapCord',
      icon: C.ICON,
      autoHideMenuBar: true,
      webPreferences: {
        preload: C.PRELOAD,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: w.spellcheck !== false,
        backgroundThrottling: false, // keep voice/notifications responsive while minimized
      },
    });
    windows.add(window);
    appIcon.attachWindow(window);
    if (b.maximized) window.maximize();

    const wc = window.webContents;
    wc.setUserAgent(wc.getUserAgent().replace(/ (YapCord|YapperMod)\/\S+/g, '') + ' YapCord/' + app.getVersion());

    wc.setWindowOpenHandler(({ url }) => {
      openExternalSafe(url);
      return { action: 'deny' };
    });
    // Only Yapper's own pages may load in this window. In particular no file:// links: the offline page is opened by
    // the app itself (loadFile does not pass through here) and only ever navigates back to the site.
    const guardNavigation = (event, url) => {
      if (isSiteUrl(url)) return;
      event.preventDefault();
      openExternalSafe(url);
    };
    wc.on('will-navigate', guardNavigation);
    wc.on('will-redirect', guardNavigation);
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3 /* aborted */) return;
      log.warn('load failed', code, desc, url);
      window.loadFile(path.join(__dirname, 'offline.html'), { query: { u: C.SITE_URL } }).catch(() => undefined);
    });
    wc.on('render-process-gone', (_e, details) => {
      log.error('renderer gone:', details);
      if (details.reason !== 'clean-exit') setTimeout(() => wc.reload(), 1000);
    });
    // Electron >= 35 passes one details object ({ level: 'error', message }); older versions pass (event, level, message).
    wc.on('console-message', (event, legacyLevel, legacyMessage) => {
      const message = String(event && event.message !== undefined ? event.message : legacyMessage || '');
      const level = event && event.level !== undefined ? event.level : legacyLevel;
      const isError = level === 'error' || level === 3;
      if (isError && /YapCord|YapperMod/.test(message)) log.error('[page]', message);
    });
    attachContextMenu(wc, { getWindow, settings, openExternal: openExternalSafe });

    window.once('ready-to-show', () => {
      const hidden = startHidden || (settings.get().window || {}).startMinimized;
      if (forceShow || !hidden) window.show();
    });

    let saveTimer = null;
    const saveBounds = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (!window || window.isDestroyed()) return;
        const maximized = window.isMaximized();
        const bounds = maximized ? (settings.get().window.bounds || {}) : window.getBounds();
        settings.setPath('window.bounds', { ...bounds, maximized });
      }, 600);
    };
    window.on('resize', saveBounds);
    window.on('move', saveBounds);
    window.on('maximize', saveBounds);
    window.on('unmaximize', saveBounds);

    window.on('close', (event) => {
      if (!quitting && (settings.get().window || {}).closeToTray && tray) {
        event.preventDefault();
        window.hide();
      }
    });
    window.on('closed', () => {
      windows.delete(window);
    });

    window.loadURL(C.SITE_URL).catch((err) => log.warn('initial load failed:', err && err.message));
  }

  function showWindow() {
    const window = getWindow();
    if (!window) return createWindow(true);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  function createTray() {
    try {
      const img = nativeImage.createFromPath(C.ICON);
      if (img.isEmpty()) return;
      const original = img.resize({ width: 16, height: 16 });
      tray = new Tray(appIcon.trayImage() || original);
      appIcon.attachTray(tray, original);
      tray.setToolTip('YapCord');
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Open YapCord', click: showWindow },
          { label: 'New Window', click: () => createWindow(true) },
          { label: 'YapCord settings', click: () => { showWindow(); openModSettings(); } },
          { type: 'separator' },
          { label: 'Quit', click: () => app.quit() },
        ]),
      );
      tray.on('click', showWindow);
    } catch (err) {
      log.warn('tray unavailable:', err && err.message);
      tray = null;
    }
  }

  function openModSettings() {
    const window = getWindow();
    if (!window) return;
    window.webContents
      .executeJavaScript('window.YapperMod && window.YapperMod.openSettings && window.YapperMod.openSettings()')
      .catch(() => undefined);
  }

  function buildMenu() {
    const devTools = (settings.get().window || {}).devTools !== false;
    const view = [{ role: 'reload' }, { role: 'forceReload' }];
    if (devTools) view.push({ role: 'toggleDevTools' });
    view.push(
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomIn', accelerator: 'CmdOrCtrl+=', visible: false },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    );
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'File',
          submenu: [
            { label: 'YapCord settings', accelerator: 'CmdOrCtrl+,', click: openModSettings },
            { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow(true) },
            { label: 'Open data folder', click: () => shell.openPath(dataDir) },
            { label: 'Open themes folder', click: () => shell.openPath(themes.dir) },
            { type: 'separator' },
            { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
          ],
        },
        { label: 'Edit', role: 'editMenu' },
        { label: 'View', submenu: view },
        { label: 'Window', role: 'windowMenu' },
      ]),
    );
  }

  // ---- lifecycle --------------------------------------------------------------------------------
  app.on('second-instance', showWindow);
  app.on('will-quit', () => settings.flush());
  app.on('before-quit', () => {
    quitting = true;
    if (rival) rival.stop();
    settings.flush();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (!getWindows().length) createWindow(true);
  });
  process.on('uncaughtException', (err) => log.error('uncaughtException:', err));
  process.on('unhandledRejection', (err) => log.error('unhandledRejection:', err));

  app.whenReady().then(() => {
    log.init(path.join(dataDir, 'logs'));
    log.info('YapCord ' + app.getVersion() + ' starting (electron ' + process.versions.electron + ')');
    if (dataLocation.migrated) log.info('moved the data folder from YapperMod to YapCord');
    if (dataLocation.legacy) log.warn('could not move the old YapperMod data folder (is the old app still running?), using it as it is:', dataLocation.error && dataLocation.error.message);

    themes.ensureDir(C.BUNDLED_THEMES_DIR);
    setupSession(session.defaultSession);
    registerIpc({ getWindow, getWindows, isTrustedWindow, settings, themes, netfilter, dataDir, applyWindowSettings, appIcon, updater });
    applyWindowSettings();
    buildMenu();
    createWindow();
    createTray();
    setTimeout(() => updater.check(), 2500);

    // Keep the official Yapper app closed while YapCord runs (switch + names: App page).
    rival = makeRivalGuard({
      execFile: require('child_process').execFile,
      ownNames: ['YapCord.exe'],
      log,
      getConfig: () => {
        const w = settings.get().window || {};
        return { enabled: w.closeYapperApp !== false, names: w.yapperAppNames };
      },
    });
    rival.start();

    themes.watch(() => send('ym:themes-changed', themes.list()));
    try {
      const fs = require('fs');
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
