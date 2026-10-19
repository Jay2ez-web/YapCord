// Bridge to the Electron main process (window.YapperNative, created by the preload).
// When the bundle runs outside the app (tests, plain browser) a localStorage-backed fallback is used.

const native = window.YapperNative;

const LS_KEY = 'yappermod:fallback-settings';
const lsRead = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch (_) {
    return {};
  }
};

function setPath(obj, dotted, value) {
  const keys = String(dotted).split('.').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!YM.util.isObj(cur[keys[i]])) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

const fallback = {
  fallback: true,
  settings: {
    get: async () => lsRead(),
    patch: async (p) => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(YM.util.deepMerge(lsRead(), p)));
      } catch (_) {}
    },
    set: async (path, value) => {
      const o = lsRead();
      setPath(o, path, value);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(o));
      } catch (_) {}
    },
  },
  quickCss: {
    get: async () => localStorage.getItem('yappermod:quickcss') || '',
    set: async (css) => {
      try {
        localStorage.setItem('yappermod:quickcss', css);
      } catch (_) {}
    },
    onChange: () => () => undefined,
  },
  themes: {
    list: async () => [],
    read: async () => '',
    remove: async () => false,
    import: async () => [],
    save: async () => null,
    fetch: async (url) => fetch(url).then((r) => { if (!r.ok) throw new Error('Theme download failed.'); return r.text(); }),
    onChange: () => () => undefined,
  },
  app: {
    info: async () => ({ version: YM.version, platform: navigator.platform, fallback: true }),
    metrics: async () => ({ sampledAt: Date.now(), processes: [] }),
    updateStatus: async () => ({ state: 'unsupported' }),
    checkForUpdates: async () => ({ state: 'unsupported' }),
    downloadUpdate: async () => ({ state: 'unsupported' }),
    installUpdate: async () => false,
    onUpdateState: () => () => undefined,
    relaunch: async () => location.reload(),
    reload: async () => location.reload(),
    devtools: async () => false,
    quit: async () => undefined,
  },
  openExternal: async (url) => void window.open(url, '_blank', 'noopener'),
  openPath: async () => '',
  setBadge: async () => undefined,
  net: null, // no cross-origin picture download outside the app
  files: null, // no own file dialog outside the app: the browser's chooser is used
  icon: null, // the app icon can only be changed inside the app
  ui: null, // page zoom is a function of the app window
  saveDiagnostics: async (text) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = 'yapcord-diagnostics.json';
    a.click();
    return true;
  },
};

YM.native = native || fallback;
YM.inApp = !!native;
