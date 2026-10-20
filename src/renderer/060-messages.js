// Message decoration API (Vencord's MessageDecorations/Accessories, adapted to Yapper's DOM).
//
//   const off = YM.messages.decorate(({ el, id, message, body, textEl }) => { ... });
//
// Decorators run for every rendered message row (.msg[data-message-id]) when it appears, when its stored message
// object changes, and when React re-renders inside it. They MUST be idempotent: do nothing if already applied.
// Add nodes to `body` (.msg-body); never move or remove React's own nodes.

const decorators = new Set();
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
  for (const fn of only ? [only] : decorators) {
    try {
      fn(info);
    } catch (err) {
      YM.log.error('message decorator failed', err);
    }
  }
}

let offDomMutate = null;
function onDomMutate(batch) {
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
}

function syncDomSubscription() {
  if (decorators.size && !offDomMutate) offDomMutate = YM.dom.onMutate(onDomMutate);
  else if (!decorators.size && offDomMutate) {
    offDomMutate();
    offDomMutate = null;
  }
}

// A message object changed in the store (edit, reaction, resolved pending, ...): re-run on affected rows.
let rafPending = false;
let pendingBaseMessages = null;
YM.Events.on('store:change', (state, prev) => {
  if (!decorators.size || !state.messages || state.messages === prev.messages) return;
  const previousMessages = prev.messages || {};
  if (rafPending) return;
  rafPending = true;
  pendingBaseMessages = previousMessages;
  requestAnimationFrame(() => {
    rafPending = false;
    const baseMessages = pendingBaseMessages;
    pendingBaseMessages = null;
    const current = YM.Store.getState();
    if (!baseMessages || !current) return;
    const nextMessages = current.messages || {};
    const changedIds = new Set();
    for (const channelId of Object.keys(nextMessages)) {
      const oldList = baseMessages[channelId] || [];
      const newList = nextMessages[channelId] || [];
      if (!Array.isArray(oldList) || !Array.isArray(newList) || oldList === newList) continue;

      // New rows are handled by the DOM observer. Skip pure appends without allocating lookup sets.
      if (newList.length >= oldList.length) {
        let unchangedPrefix = true;
        for (let i = 0; i < oldList.length; i++) {
          if (newList[i] !== oldList[i]) { unchangedPrefix = false; break; }
        }
        if (unchangedPrefix) continue;
      }

      const oldById = new Map();
      for (const message of oldList) if (message && message.id != null) oldById.set(message.id, message);
      for (const message of newList) {
        const old = message && oldById.get(message.id);
        if (old && old !== message) changedIds.add(message.id);
      }
    }
    if (!changedIds.size) return;
    document.querySelectorAll(SELECTOR).forEach((el) => {
      if (changedIds.has(el.getAttribute('data-message-id'))) runOn(el);
    });
  });
});

YM.messages = {
  selector: SELECTOR,
  decorate(fn) {
    decorators.add(fn);
    syncDomSubscription();
    document.querySelectorAll(SELECTOR).forEach((el) => runOn(el, fn));
    return () => {
      decorators.delete(fn);
      syncDomSubscription();
    };
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
