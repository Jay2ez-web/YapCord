'use strict';
const fs = require('fs');
const path = require('path');
const { app, ipcMain, shell, dialog, nativeImage, net } = require('electron');
const { SITE_HOSTS, BUNDLED_THEMES_DIR } = require('./constants');
const { safeName } = require('./themes');
const { buildBundle } = require('./bundle');
const { pickFiles } = require('./filepick');
const { fetchImage } = require('./imagefetch');
const log = require('./log');

function isHttpUrl(u) {
  try {
    const p = new URL(u).protocol;
    return p === 'https:' || p === 'http:' || p === 'mailto:';
  } catch (_) {
    return false;
  }
}

/**
 * @param {{ getWindow: () => Electron.BrowserWindow|null, settings: import('./settings').SettingsStore,
 *           themes: import('./themes').ThemeManager, netfilter: import('./netfilter').NetFilter,
 *           dataDir: string, applyWindowSettings: () => void }} ctx
 */
function registerIpc(ctx) {
  const { getWindow, settings, themes, netfilter, dataDir } = ctx;

  /** Only the main window showing a Yapper page may talk to us. */
  function trusted(event) {
    const win = typeof ctx.isTrustedWindow === 'function'
      ? (ctx.isTrustedWindow(event.sender) ? true : null)
      : (() => { const current = getWindow(); return current && !current.isDestroyed() && event.sender === current.webContents ? true : null; })();
    if (!win) return false;
    try {
      const u = new URL(event.senderFrame ? event.senderFrame.url : event.sender.getURL());
      return u.protocol === 'https:' && SITE_HOSTS.includes(u.hostname);
    } catch (_) {
      return false;
    }
  }

  const handle = (channel, fn) =>
    ipcMain.handle(channel, async (event, ...args) => {
      if (!trusted(event)) throw new Error('untrusted sender');
      try {
        return await fn(event, ...args);
      } catch (err) {
        log.error('ipc ' + channel + ' failed:', err);
        throw err;
      }
    });

  const initialState = () => ({
    settings: settings.get(),
    quickCss: settings.readQuickCss(),
    themes: themes.list(),
    themeCss: Object.fromEntries(
      (settings.get().enabledThemes || []).map((f) => [f, themes.read(f)]).filter(([, css]) => css),
    ),
    app: appInfo(),
  });

  function appInfo() {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      dataDir,
      settingsDir: settings.dir,
      themesDir: themes.dir,
      logFile: log.file,
      mode: ctx.mode || 'standalone', // 'official' = running inside the official Yapper app
    };
  }

  // The bundle is fetched synchronously so it can run before any page script.
  ipcMain.on('ym:get-bundle', (event) => {
    if (!trusted(event)) {
      event.returnValue = '';
      return;
    }
    try {
      event.returnValue = buildBundle(initialState());
    } catch (err) {
      log.error('bundle build failed:', err);
      event.returnValue = '';
    }
  });

  handle('ym:settings:get', () => settings.get());
  handle('ym:settings:patch', (_e, partial) => {
    settings.patch(partial);
    ctx.applyWindowSettings();
  });
  handle('ym:settings:set', (_e, dotted, value) => {
    settings.setPath(dotted, value);
    ctx.applyWindowSettings();
  });

  handle('ym:quickcss:get', () => settings.readQuickCss());
  handle('ym:quickcss:set', (_e, css) => settings.writeQuickCss(css));

  handle('ym:themes:list', () => themes.list());
  handle('ym:themes:read', (_e, fileName) => themes.read(fileName));
  handle('ym:themes:remove', (_e, fileName) => themes.remove(fileName));
  handle('ym:themes:import', async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win, {
      title: 'Add a theme',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'CSS themes', extensions: ['css'] }],
    });
    if (res.canceled) return [];
    const added = [];
    for (const f of res.filePaths) {
      try {
        const name = themes.importFile(f);
        if (name) added.push(name);
      } catch (err) {
        log.error('theme import failed:', err);
      }
    }
    return added;
  });
  handle('ym:themes:save', (_e, fileName, css) => themes.save(fileName, css));
  handle('ym:themes:fetch', async (_e, url) => {
    const target = new URL(String(url));
    if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error('Only http(s) theme URLs are allowed.');
    const response = await net.fetch(target.href, { headers: { Accept: 'text/css,text/plain;q=0.9,*/*;q=0.1' } });
    if (!response.ok) throw new Error('Theme download failed with HTTP ' + response.status + '.');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 4 * 1024 * 1024) throw new Error('Theme file is larger than 4 MB.');
    const css = await response.text();
    if (css.length > 4 * 1024 * 1024) throw new Error('Theme file is larger than 4 MB.');
    return css;
  });

  // Our own file picker for <input type=file>.click() (see renderer/063-filepicker.js). Returns the chosen files' bytes.
  handle('ym:files:pick', async (_e, opts) => {
    const o = opts && typeof opts === 'object' ? opts : {};
    return pickFiles({ dialog, win: getWindow() }, { accept: typeof o.accept === 'string' ? o.accept.slice(0, 2000) : '', multiple: !!o.multiple });
  });

  // One picture from Yapper's own file hosts, without CORS (for plugins that draw on avatars). See imagefetch.js.
  handle('ym:net:image', (_e, url) => fetchImage({ net }, url));

  handle('ym:open-external', (_e, url) => {
    if (!isHttpUrl(url)) throw new Error('blocked url');
    return shell.openExternal(url);
  });

  handle('ym:open-path', async (_e, which) => {
    const map = { data: dataDir, themes: themes.dir, settings: settings.dir, logs: path.join(dataDir, 'logs') };
    const target = typeof which === 'string' && Object.prototype.hasOwnProperty.call(map, which) ? map[which] : null;
    if (!target) throw new Error('unknown path');
    fs.mkdirSync(target, { recursive: true });
    const err = await shell.openPath(target);
    return err || '';
  });

  handle('ym:app:info', () => ({ ...appInfo(), netfilter: netfilter.stats() }));
  // Local-only diagnostics for the Performance panel; no process command lines or file paths are exposed.
  handle('ym:app:metrics', () => ({
    sampledAt: Date.now(),
    processes: app.getAppMetrics().map((m) => ({
      pid: m.pid,
      type: m.type,
      cpuPercent: Number(m.cpu && m.cpu.percentCPUUsage) || 0,
      workingSetKB: Number(m.memory && m.memory.workingSetSize) || 0,
      privateKB: Number(m.memory && m.memory.privateBytes) || 0,
    })),
  }));
  handle('ym:app:relaunch', () => {
    settings.flush();
    app.relaunch();
    app.exit(0);
  });
  handle('ym:app:reload', (event) => event.sender.reloadIgnoringCache());
  handle('ym:app:devtools', (event) => {
    if (settings.get().window.devTools === false) return false;
    event.sender.toggleDevTools();
    return true;
  });
  handle('ym:app:quit', () => {
    app.quit();
  });

  handle('ym:badge', (_e, count, overlayDataUrl) => {
    const n = Math.max(0, Math.min(9999, Number(count) || 0));
    try {
      app.setBadgeCount(n);
    } catch (_) {
      /* not supported everywhere */
    }
    const win = getWindow();
    if (win && process.platform === 'win32') {
      try {
        if (n > 0 && typeof overlayDataUrl === 'string' && overlayDataUrl.startsWith('data:image/png')) {
          win.setOverlayIcon(nativeImage.createFromDataURL(overlayDataUrl), n + ' unread');
        } else {
          win.setOverlayIcon(null, '');
        }
      } catch (_) {
        /* ignore */
      }
    }
  });

  // Whole-page zoom (Layout page). Chromium keeps it per site; the page asks for it again at every start.
  handle('ym:ui:zoom', (event, percent) => {
    const n = Number(percent);
    const f = Math.min(2, Math.max(0.5, Number.isFinite(n) ? n / 100 : 1));
    event.sender.setZoomFactor(f);
    return f;
  });

  // The app icon chosen in the CustomIcons plugin (see appicon.js).
  handle('ym:icon:state', () => (ctx.appIcon ? { has: ctx.appIcon.has(), preview: ctx.appIcon.previewDataUrl() } : { has: false, preview: '' }));
  handle('ym:icon:set', (_e, dataUrl) => {
    if (!ctx.appIcon) throw new Error('not available');
    ctx.appIcon.set(dataUrl);
    return true;
  });
  handle('ym:icon:clear', () => {
    if (ctx.appIcon) ctx.appIcon.clear();
    return true;
  });

  handle('ym:diag:save', async (_e, text) => {
    const win = getWindow();
    const res = await dialog.showSaveDialog(win, {
      title: 'Save diagnostics',
      defaultPath: 'yapcord-diagnostics.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return false;
    fs.writeFileSync(res.filePath, String(text || ''), 'utf8');
    return true;
  });

  return { initialState, appInfo };
}

module.exports = { registerIpc, isHttpUrl, BUNDLED_THEMES_DIR };
