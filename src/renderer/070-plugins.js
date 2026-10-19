// Plugin manager (Vencord-style definePlugin).
//
// YM.definePlugin({
//   name, description, authors:[], tags:[], enabledByDefault, hidden,
//   options: { key: { type:'boolean'|'string'|'number'|'select'|'slider'|'custom', default, description, options:[{label,value}], min,max,step, render(container, plugin) } },
//   patches: [...], start(ctx), stop()
// })
// `ctx` (passed to start) auto-cleans on stop: ctx.cleanup(fn), ctx.css(text), ctx.watch(sel, fn), ctx.on(event, fn), ctx.interval(fn, ms).

const registry = new Map();
const running = new Map(); // name -> { cleanups: [] }
const errors = new Map();

function makeCtx(plugin, state) {
  // A start() that finishes after the plugin was switched off again (async start) must not leave listeners behind:
  // once the plugin is stopped, anything it registers is undone straight away.
  const keep = (fn) => {
    if (typeof fn !== 'function') return;
    if (!state.stopped) {
      state.cleanups.push(fn);
      return;
    }
    try {
      fn();
    } catch (err) {
      YM.log.error('plugin ' + plugin.name + ' cleanup failed', err);
    }
  };
  const ctx = {
    log: {
      info: (...a) => YM.log.info('[' + plugin.name + ']', ...a),
      warn: (...a) => YM.log.warn('[' + plugin.name + ']', ...a),
      error: (...a) => YM.log.error('[' + plugin.name + ']', ...a),
      debug: (...a) => YM.log.debug('[' + plugin.name + ']', ...a),
    },
    settings: plugin.settings,
    cleanup(fn) {
      keep(fn);
      return fn;
    },
    css(text) {
      const id = 'plugin-' + plugin.name;
      YM.dom.css.set(id, text);
      keep(() => YM.dom.css.remove(id));
    },
    watch(selector, fn) {
      keep(YM.dom.watch(selector, fn));
    },
    onMutate(fn) {
      keep(YM.dom.onMutate(fn));
    },
    on(event, fn) {
      keep(YM.Events.on(event, fn));
    },
    interval(fn, ms) {
      const id = setInterval(fn, ms);
      keep(() => clearInterval(id));
    },
    timeout(fn, ms) {
      const id = setTimeout(fn, ms);
      keep(() => clearTimeout(id));
    },
  };
  return ctx;
}

const Plugins = (YM.plugins = {
  registry,
  errors,
  list: () => [...registry.values()],
  get: (name) => registry.get(name),
  isEnabled: (name) => YM.settings.isPluginEnabled(name),
  isRunning: (name) => running.has(name),

  start(name) {
    const plugin = registry.get(name);
    if (!plugin || running.has(name)) return;
    const state = { cleanups: [] };
    running.set(name, state);
    errors.delete(name);
    try {
      if (plugin.patches) YM.patches.register(name, plugin.patches);
      const ret = plugin.start && plugin.start(makeCtx(plugin, state));
      if (typeof ret === 'function') state.cleanups.push(ret);
      else if (ret && typeof ret.then === 'function') {
        ret.then(
          (r) => {
            if (typeof r === 'function') {
              if (running.get(name) === state) state.cleanups.push(r);
              else r();
            }
          },
          (err) => {
            // An async start() that rejects must not leave half-started parts behind (CSS, listeners) nor show as running.
            if (running.get(name) === state) Plugins.stop(name);
            errors.set(name, err);
            YM.log.error('plugin ' + name + ' failed to start', err);
            YM.Events.emit('plugin:error', name, err);
          },
        );
      }
      YM.log.info('started plugin ' + name);
    } catch (err) {
      errors.set(name, err);
      YM.log.error('plugin ' + name + ' failed to start', err);
      Plugins.stop(name);
      errors.set(name, err);
      YM.Events.emit('plugin:error', name, err);
    }
    YM.Events.emit('plugin:state', name, running.has(name));
  },

  stop(name) {
    const plugin = registry.get(name);
    const state = running.get(name);
    if (!state) return;
    running.delete(name);
    state.stopped = true;
    try {
      if (plugin && plugin.stop) plugin.stop();
    } catch (err) {
      YM.log.error('plugin ' + name + ' stop() failed', err);
    }
    for (const fn of state.cleanups.reverse()) {
      try {
        fn();
      } catch (err) {
        YM.log.error('plugin ' + name + ' cleanup failed', err);
      }
    }
    if (plugin && plugin.patches) YM.patches.unregister(name);
    YM.Events.emit('plugin:state', name, false);
  },

  setEnabled(name, enabled) {
    YM.settings.set('plugins.' + name + '.enabled', !!enabled);
    if (enabled) Plugins.start(name);
    else Plugins.stop(name);
  },

  startEnabled() {
    for (const name of registry.keys()) if (Plugins.isEnabled(name)) Plugins.start(name);
  },
});

YM.definePlugin = function definePlugin(def) {
  if (!def || typeof def.name !== 'string' || !def.name) throw new Error('definePlugin: name is required');
  if (registry.has(def.name)) throw new Error('definePlugin: duplicate plugin ' + def.name);
  def.options = def.options || {};
  def.authors = def.authors || [];
  def.tags = def.tags || [];
  def.settings = YM.PluginSettings.create(def.name, def.options);
  // New installs: honour enabledByDefault the first time a plugin is seen.
  const raw = YM.settings.data.plugins[def.name];
  if (!raw && def.enabledByDefault) YM.settings.data.plugins[def.name] = { enabled: true };
  registry.set(def.name, def);
  return def;
};
