// Message decoration API (Vencord's MessageDecorations/Accessories, adapted to Yapper's DOM).
//
//   const off = YM.messages.decorate(({ el, id, message, body, textEl }) => { ... });
//
// Decorators run for every rendered message row (.msg[data-message-id]) when it appears, when its stored message
// object changes, and when React re-renders inside it. They MUST be idempotent: do nothing if already applied.
// Add nodes to `body` (.msg-body); never move or remove React's own nodes.

const decorators = new Set();
const lastMessage = new WeakMap();
const SELECTOR = '.msg[data-message-id]';

function infoFor(el) {
  const id = el.getAttribute('data-message-id');
  return {
    el,
    id,
    message: YM.Store.isReady ? YM.Store.findMessage(id) : null,
    body: el.querySelector(':scope > .msg-body'),
    textEl: el.querySelector(':scope > .msg-body > .msg-text'),
  };
}

function runOn(el, only) {
  const info = infoFor(el);
  if (!info.id) return;
  lastMessage.set(el, info.message);
  for (const fn of only ? [only] : decorators) {
    try {
      fn(info);
    } catch (err) {
      YM.log.error('message decorator failed', err);
    }
  }
}

YM.dom.onMutate((batch) => {
  if (!decorators.size) return;
  const els = new Set();
  for (const rec of batch) {
    const t = rec.target && (rec.target.nodeType === 1 ? rec.target : rec.target.parentElement);
    const row = t && t.closest ? t.closest(SELECTOR) : null;
    if (row) els.add(row);
    for (const n of rec.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches(SELECTOR)) els.add(n);
      else if (n.querySelector) n.querySelectorAll(SELECTOR).forEach((e) => els.add(e));
    }
  }
  els.forEach((el) => runOn(el));
});

// A message object changed in the store (edit, reaction, resolved pending, ...): re-run on affected rows.
let rafPending = false;
YM.Events.on('store:change', (state, prev) => {
  if (!decorators.size || state.messages === prev.messages) return;
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    document.querySelectorAll(SELECTOR).forEach((el) => {
      const id = el.getAttribute('data-message-id');
      const msg = YM.Store.findMessage(id);
      if (lastMessage.get(el) !== msg) runOn(el);
    });
  });
});

YM.messages = {
  selector: SELECTOR,
  decorate(fn) {
    decorators.add(fn);
    document.querySelectorAll(SELECTOR).forEach((el) => runOn(el, fn));
    return () => decorators.delete(fn);
  },
  /** Re-run every decorator on all visible rows (after a setting changed). */
  refresh() {
    document.querySelectorAll(SELECTOR).forEach((el) => runOn(el));
  },
  forEachVisible(fn) {
    document.querySelectorAll(SELECTOR).forEach((el) => fn(infoFor(el)));
  },
  info: infoFor,
};
