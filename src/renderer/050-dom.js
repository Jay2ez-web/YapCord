// DOM helpers: element builder, managed <style> tags, one shared MutationObserver, toasts.

const dom = (YM.dom = {});

/** h('div', { class: 'x', onClick: fn, style: {color:'red'}, dataset: {a: 1} }, child, 'text', [more]) */
dom.h = function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'style') el.setAttribute('style', v);
      else if (k === 'dataset') for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v; // only ever called with trusted/escaped strings
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
};

// ---- managed styles ----------------------------------------------------------------------------
// The bundle runs at document start, when <html> may not exist yet: queue elements until it does.
const styles = new Map();
const waiting = new Set();
let waitingObserver = null;

function attach(el) {
  const host = document.head || document.documentElement;
  if (host) {
    host.appendChild(el);
    return;
  }
  waiting.add(el);
  if (waitingObserver) return;
  waitingObserver = new MutationObserver(() => {
    const target = document.head || document.documentElement;
    if (!target) return;
    waitingObserver.disconnect();
    waitingObserver = null;
    for (const w of waiting) target.appendChild(w);
    waiting.clear();
  });
  waitingObserver.observe(document, { childList: true, subtree: true });
}

dom.css = {
  /** Add or replace a <style id="ym-style-<id>">. */
  set(id, text) {
    let el = styles.get(id);
    if (!el) {
      el = document.createElement('style');
      el.id = 'ym-style-' + id;
      el.setAttribute('data-yappermod', id);
      styles.set(id, el);
    }
    el.textContent = text;
    if (!el.isConnected) attach(el);
    return el;
  },
  remove(id) {
    const el = styles.get(id);
    if (el) {
      waiting.delete(el);
      el.remove();
      styles.delete(id);
    }
  },
  has: (id) => styles.has(id),
};

// ---- shared observer ---------------------------------------------------------------------------
// `dom.watch(selector, fn)` calls fn(el) once for each matching element that is (or becomes) present.
// `dom.onMutate(fn)` runs fn at most once per animation frame while the DOM is changing.
const watchers = new Set();
const mutateListeners = new Set();
let scheduled = false;
let pending = [];
let observer = null;

function matchesDeep(node, selector, cb) {
  if (node.nodeType !== 1) return;
  if (node.matches(selector)) cb(node);
  const found = node.querySelectorAll(selector);
  for (let i = 0; i < found.length; i++) cb(found[i]);
}

function flush() {
  scheduled = false;
  const batch = pending;
  pending = [];
  for (const w of watchers) {
    for (const rec of batch) {
      for (const n of rec.addedNodes) {
        matchesDeep(n, w.selector, (el) => {
          if (w.seen.has(el)) return;
          w.seen.add(el);
          try {
            w.fn(el);
          } catch (err) {
            YM.log.error('watch callback failed for ' + w.selector, err);
          }
        });
      }
    }
  }
  for (const fn of [...mutateListeners]) {
    try {
      fn(batch);
    } catch (err) {
      YM.log.error('onMutate callback failed', err);
    }
  }
}

function ensureObserver() {
  if (observer) return;
  observer = new MutationObserver((records) => {
    // A loop instead of push(...records): a huge batch (a channel with thousands of messages) would overflow the stack.
    for (let i = 0; i < records.length; i++) pending.push(records[i]);
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  });
  const start = () => observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}

dom.watch = function watch(selector, fn) {
  ensureObserver();
  const w = { selector, fn, seen: new WeakSet() };
  watchers.add(w);
  const scan = () => document.querySelectorAll(selector).forEach((el) => {
    if (w.seen.has(el)) return;
    w.seen.add(el);
    try {
      fn(el);
    } catch (err) {
      YM.log.error('watch callback failed for ' + selector, err);
    }
  });
  if (document.body) scan();
  else YM.domReady.then(scan);
  return () => watchers.delete(w);
};

dom.onMutate = function onMutate(fn) {
  ensureObserver();
  mutateListeners.add(fn);
  return () => mutateListeners.delete(fn);
};

/** Resolve with the first element matching selector (or null after timeout ms). */
dom.waitFor = function waitFor(selector, timeout = 10000) {
  return new Promise((resolve) => {
    const now = document.querySelector(selector);
    if (now) return resolve(now);
    let timer = null;
    const off = dom.onMutate(() => {
      const el = document.querySelector(selector);
      if (el) {
        off();
        clearTimeout(timer);
        resolve(el);
      }
    });
    if (timeout) {
      timer = setTimeout(() => {
        off();
        resolve(null);
      }, timeout);
    }
  });
};

// ---- toast -------------------------------------------------------------------------------------
let toastHost = null;
dom.toast = function toast(message, { type = 'info', duration = 3500 } = {}) {
  if (!toastHost || !toastHost.isConnected) {
    toastHost = dom.h('div', { class: 'ym-toasts', role: 'status', 'aria-live': 'polite' });
    (document.body || document.documentElement).appendChild(toastHost);
  }
  const el = dom.h('div', { class: 'ym-toast ym-toast-' + type }, String(message));
  toastHost.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  }, duration);
  return el;
};
YM.toast = dom.toast;

dom.css.set(
  'core',
  `
.ym-toasts{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.ym-toast{pointer-events:auto;max-width:360px;padding:10px 14px;border-radius:10px;background:var(--bg-3,#2a2c33);color:var(--text,#f2f3f5);
  font:500 13px/1.35 Inter,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.08);animation:ym-in .2s ease}
.ym-toast-error{border-color:#e5484d}.ym-toast-success{border-color:#30a46c}
.ym-toast.out{opacity:0;transform:translateY(6px);transition:all .25s}
@keyframes ym-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
`,
);
