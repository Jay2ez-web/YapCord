// Settings store (persisted by the main process in settings.json).

const initial = YM.initial || {};
const data = YM.util.clone(initial.settings) || {};
data.plugins = data.plugins || {};
data.window = data.window || {};
data.enabledThemes = data.enabledThemes || [];
data.themeLinks = data.themeLinks || [];
if (data.useQuickCss === undefined) data.useQuickCss = true;

const bus = new YM.Emitter();

function getPath(obj, dotted) {
  let cur = obj;
  for (const k of String(dotted).split('.')) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function setPath(obj, dotted, value) {
  const keys = String(dotted).split('.').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!YM.util.isObj(cur[keys[i]])) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

const Settings = (YM.settings = {
  data,
  get(path, fallback) {
    const v = getPath(data, path);
    return v === undefined ? fallback : v;
  },
  /** Set a value (dotted path). Persisted through the main process. */
  set(path, value) {
    if (/(^|\.)(__proto__|constructor|prototype)(\.|$)/.test(path)) return;
    setPath(data, path, value);
    try {
      const saved = YM.native.settings.set(path, value);
      if (saved && typeof saved.catch === 'function') saved.catch((err) => YM.log.warn('could not persist setting', path, err));
    } catch (err) {
      YM.log.warn('could not persist setting', path, err);
    }
    Settings.announce(path, value);
  },
  /** Tell listeners that a setting changed (set() does this; also used when a whole group is replaced). */
  announce(path, value) {
    bus.emit('change', path, value);
    bus.emit('change:' + path, value);
  },
  /** Replace the local copy without writing. */
  onChange(fn) {
    return bus.on('change', fn);
  },
  onPath(path, fn) {
    return bus.on('change:' + path, fn);
  },
  isPluginEnabled(name) {
    const p = data.plugins[name];
    return !!(p && p.enabled);
  },
});

YM.PluginSettings = {
  /** Option storage for a single plugin: reads fall back to the defaults declared by the plugin. */
  create(name, optionDefs) {
    const defaults = {};
    for (const [k, def] of Object.entries(optionDefs || {})) defaults[k] = def.default;
    const readRaw = () => data.plugins[name] || {};
    const store = new Proxy(
      {},
      {
        get(_t, key) {
          if (typeof key !== 'string') return undefined;
          const raw = readRaw();
          return raw[key] === undefined ? defaults[key] : raw[key];
        },
        set(_t, key, value) {
          if (typeof key !== 'string') return false;
          Settings.set('plugins.' + name + '.' + key, value);
          return true;
        },
        ownKeys: () => Object.keys(defaults),
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
      },
    );
    return {
      store,
      defaults,
      get: (k) => store[k],
      set: (k, v) => (store[k] = v),
      reset(k) {
        Settings.set('plugins.' + name + '.' + k, defaults[k]);
      },
      resetAll() {
        const raw = readRaw();
        const keys = new Set([...Object.keys(raw), ...Object.keys(defaults)]);
        keys.delete('enabled');
        Settings.set('plugins.' + name, { enabled: !!raw.enabled });
        // Replacing the whole group announces only "plugins.<name>"; plugins listen per option, so tell them each one.
        for (const k of keys) Settings.announce('plugins.' + name + '.' + k, defaults[k]);
      },
      onChange(fn) {
        return Settings.onChange((path, value) => {
          const m = path.match(new RegExp('^plugins\\.' + YM.util.escapeRegex(name) + '\\.(.+)$'));
          if (m && m[1] !== 'enabled') fn(m[1], value);
        });
      },
    };
  },
};
