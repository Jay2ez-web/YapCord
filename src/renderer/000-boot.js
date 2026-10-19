// YapCord renderer core: boot, logging, small utilities and an event bus.
// Every file in src/renderer is wrapped as (function (YM) { ... })(YM) by the bundler.

const initialAppInfo = YM.initial && YM.initial.app;
const yapcordVersion = initialAppInfo && initialAppInfo.yapcordVersion;
const standaloneVersion = initialAppInfo && initialAppInfo.mode !== 'official' && initialAppInfo.version;
YM.version = String(yapcordVersion || standaloneVersion || 'unknown');
// true when YapCord runs inside the official Yapper desktop app (installed by Install-in-Yapper.bat) instead of as its own app
YM.official = !!(YM.initial && YM.initial.app && YM.initial.app.mode === 'official');
YM.startedAt = Date.now();
YM.testMode = !!window.__YM_TEST__;

const LOG_STYLE = 'color:#ff6b4a;font-weight:700';
const ring = [];
function pushRing(level, args) {
  ring.push({ t: Date.now(), level, msg: args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : safeJson(a))).join(' ') });
  if (ring.length > 200) ring.shift();
}
function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch (_) {
    return String(v);
  }
}

YM.log = {
  info: (...a) => (pushRing('info', a), console.log('%c[YapCord]', LOG_STYLE, ...a)),
  warn: (...a) => (pushRing('warn', a), console.warn('%c[YapCord]', LOG_STYLE, ...a)),
  error: (...a) => (pushRing('error', a), console.error('[YapCord]', ...a)),
  debug: (...a) => {
    if (YM.debug) console.debug('%c[YapCord]', LOG_STYLE, ...a);
  },
  recent: () => ring.slice(),
};

// ---- utilities ---------------------------------------------------------------------------------
const util = (YM.util = {});

util.isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
util.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
util.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
util.uid = () => Math.random().toString(36).slice(2, 10);

util.debounce = (fn, wait = 100) => {
  let t = null;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  d.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  d.cancel = () => clearTimeout(t);
  return d;
};

util.throttle = (fn, wait = 100) => {
  let last = 0;
  let timer = null;
  let pending = null;
  return (...args) => {
    const now = Date.now();
    pending = args;
    if (now - last >= wait) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn(...pending);
      }, wait - (now - last));
    }
  };
};

util.once = (fn) => {
  let done = false;
  let val;
  return (...a) => (done ? val : ((done = true), (val = fn(...a))));
};

util.deepMerge = (target, patch) => {
  if (!util.isObj(target) || !util.isObj(patch)) return patch;
  const out = { ...target };
  for (const k of Object.keys(patch)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = util.isObj(patch[k]) && util.isObj(target[k]) ? util.deepMerge(target[k], patch[k]) : patch[k];
  }
  return out;
};

util.clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

util.escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

util.escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

util.copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }
};

util.formatDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch (_) {
    return String(iso || '');
  }
};

util.pluralize = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;

// ---- event bus ---------------------------------------------------------------------------------
class Emitter {
  constructor() {
    this.map = new Map();
  }
  on(name, fn) {
    let set = this.map.get(name);
    if (!set) this.map.set(name, (set = new Set()));
    set.add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, (...a) => {
      off();
      fn(...a);
    });
    return off;
  }
  off(name, fn) {
    const set = this.map.get(name);
    if (set) set.delete(fn);
  }
  has(name) {
    const set = this.map.get(name);
    return !!set && set.size > 0;
  }
  emit(name, ...args) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (err) {
        YM.log.error('listener for "' + name + '" failed', err);
      }
    }
  }
}
YM.Emitter = Emitter;
YM.Events = new Emitter();

// ---- tiny promise helpers ----------------------------------------------------------------------
YM.deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// Resolves when <head>/<body> exist and the DOM is parsed.
YM.domReady = new Promise((resolve) => {
  if (document.readyState !== 'loading') resolve();
  else document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
});
