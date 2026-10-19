'use strict';
// Runs in an isolated world before any page script. It (1) exposes a small, safe native API to the page
// and (2) injects the YapCord runtime into the page's main world at document start.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

const SITE_HOSTS = ['yapper.website', 'www.yapper.website'];
const onSite = location.protocol === 'https:' && SITE_HOSTS.includes(location.hostname);

if (onSite && window.top === window) {
  const listeners = { themes: new Set(), quickCss: new Set() };
  ipcRenderer.on('ym:themes-changed', (_e, list) => listeners.themes.forEach((cb) => safe(cb, list)));
  ipcRenderer.on('ym:quickcss-changed', (_e, css) => listeners.quickCss.forEach((cb) => safe(cb, css)));

  const safe = (cb, arg) => {
    try {
      cb(arg);
    } catch (err) {
      console.error('[YapCord] listener failed', err);
    }
  };
  const sub = (set, cb) => {
    if (typeof cb !== 'function') return () => undefined;
    set.add(cb);
    return () => set.delete(cb);
  };

  const api = {
    settings: {
      get: () => ipcRenderer.invoke('ym:settings:get'),
      patch: (partial) => ipcRenderer.invoke('ym:settings:patch', partial),
      set: (path, value) => ipcRenderer.invoke('ym:settings:set', String(path), value),
    },
    quickCss: {
      get: () => ipcRenderer.invoke('ym:quickcss:get'),
      set: (css) => ipcRenderer.invoke('ym:quickcss:set', String(css)),
      onChange: (cb) => sub(listeners.quickCss, cb),
    },
    themes: {
      list: () => ipcRenderer.invoke('ym:themes:list'),
      read: (fileName) => ipcRenderer.invoke('ym:themes:read', String(fileName)),
      remove: (fileName) => ipcRenderer.invoke('ym:themes:remove', String(fileName)),
      import: () => ipcRenderer.invoke('ym:themes:import'),
      save: (fileName, css) => ipcRenderer.invoke('ym:themes:save', String(fileName), String(css)),
      fetch: (url) => ipcRenderer.invoke('ym:themes:fetch', String(url)),
      onChange: (cb) => sub(listeners.themes, cb),
    },
    app: {
      info: () => ipcRenderer.invoke('ym:app:info'),
      metrics: () => ipcRenderer.invoke('ym:app:metrics'),
      relaunch: () => ipcRenderer.invoke('ym:app:relaunch'),
      reload: () => ipcRenderer.invoke('ym:app:reload'),
      devtools: () => ipcRenderer.invoke('ym:app:devtools'),
      quit: () => ipcRenderer.invoke('ym:app:quit'),
    },
    openExternal: (url) => ipcRenderer.invoke('ym:open-external', String(url)),
    openPath: (which) => ipcRenderer.invoke('ym:open-path', String(which)),
    setBadge: (count, overlayDataUrl) => ipcRenderer.invoke('ym:badge', Number(count) || 0, overlayDataUrl ? String(overlayDataUrl) : ''),
    net: {
      image: (url) => ipcRenderer.invoke('ym:net:image', String(url)),
    },
    files: {
      pick: (opts) => ipcRenderer.invoke('ym:files:pick', { accept: String((opts && opts.accept) || ''), multiple: !!(opts && opts.multiple) }),
    },
    ui: {
      setZoom: (percent) => ipcRenderer.invoke('ym:ui:zoom', Number(percent) || 100),
    },
    icon: {
      state: () => ipcRenderer.invoke('ym:icon:state'),
      setApp: (dataUrl) => ipcRenderer.invoke('ym:icon:set', String(dataUrl)),
      clearApp: () => ipcRenderer.invoke('ym:icon:clear'),
    },
    saveDiagnostics: (text) => ipcRenderer.invoke('ym:diag:save', String(text)),
  };
  contextBridge.exposeInMainWorld('YapperNative', api);

  try {
    const bundle = ipcRenderer.sendSync('ym:get-bundle');
    if (bundle) {
      // Runs synchronously in the main world, before Yapper's own scripts.
      webFrame.executeJavaScript(bundle).catch((err) => console.error('[YapCord] injection failed', err));
    } else {
      console.error('[YapCord] no bundle received');
    }
  } catch (err) {
    console.error('[YapCord] could not load bundle', err);
  }
}
