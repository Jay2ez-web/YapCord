// Network hooks: WebSocket frames (Yapper's realtime channel), fetch (Supabase REST), and message send/edit events.

const Net = (YM.net = {
  wsOpened: 0,
  wsIn: 0,
  wsOut: 0,
  fetchCalls: 0,
  sockets: new Set(),
});

// ---- WebSocket ---------------------------------------------------------------------------------
const wsSendHooks = new Set();
Net.onWsSend = (fn) => {
  wsSendHooks.add(fn);
  return () => wsSendHooks.delete(fn);
};

const NativeWS = window.WebSocket;
if (NativeWS && !NativeWS.__ym) {
  const nativeSend = NativeWS.prototype.send;

  const PatchedWS = function (url, protocols) {
    const ws = arguments.length > 1 ? new NativeWS(url, protocols) : new NativeWS(url);
    try {
      Net.wsOpened++;
      Net.sockets.add(ws);
      ws.addEventListener('close', () => Net.sockets.delete(ws));
      ws.addEventListener('message', (ev) => {
        Net.wsIn++;
        const data = ev.data;
        if (typeof data !== 'string' || data.charCodeAt(0) !== 123) return; // not a JSON object
        if (!YM.Events.has('ws:json') && !YM.Events.has('ws:event')) return;
        let obj;
        try {
          obj = JSON.parse(data);
        } catch (_) {
          return;
        }
        YM.Events.emit('ws:json', obj, ws);
        if (obj && obj.type === 'event') YM.Events.emit('ws:event', obj.event, obj.payload, ws);
      });
      YM.Events.emit('ws:open', ws, String(url));
    } catch (err) {
      YM.log.error('websocket hook failed', err);
    }
    return ws;
  };
  PatchedWS.prototype = NativeWS.prototype;
  // CONNECTING/OPEN/CLOSING/CLOSED are inherited through the prototype chain (they are read-only on WebSocket).
  Object.setPrototypeOf(PatchedWS, NativeWS);
  Object.defineProperty(PatchedWS, '__ym', { value: true });
  window.WebSocket = PatchedWS;

  NativeWS.prototype.send = function (data) {
    Net.wsOut++;
    if (wsSendHooks.size && typeof data === 'string') {
      for (const hook of wsSendHooks) {
        try {
          const r = hook(data, this);
          if (r === false) return undefined; // dropped
          if (typeof r === 'string') data = r;
        } catch (err) {
          YM.log.error('ws send hook failed', err);
        }
      }
    }
    return nativeSend.call(this, data);
  };
}

// ---- fetch -------------------------------------------------------------------------------------
const fetchHooks = new Set();

/**
 * Register a fetch hook. `test(url, method)` decides if it applies; `before(ctx)` may change ctx.json (parsed request
 * body), ctx.init, or set ctx.cancel = true; `after(ctx, response)` receives a clone of the response (read-only
 * observation). Only fetch(string|URL, init) calls are inspected.
 */
Net.onFetch = (hook) => {
  fetchHooks.add(hook);
  return () => fetchHooks.delete(hook);
};

const nativeFetch = window.fetch;
if (typeof nativeFetch === 'function' && !nativeFetch.__ym) {
  const patchedFetch = function (input, init) {
    Net.fetchCalls++;
    if (!fetchHooks.size || (typeof input !== 'string' && !(input instanceof URL))) {
      return nativeFetch.apply(this, arguments);
    }
    const url = typeof input === 'string' ? input : input.href;
    const method = String((init && init.method) || 'GET').toUpperCase();
    const hooks = [];
    for (const h of fetchHooks) {
      try {
        if (h.test(url, method)) hooks.push(h);
      } catch (_) {}
    }
    if (!hooks.length) return nativeFetch.apply(this, arguments);

    const ctx = { url, method, init: init ? { ...init } : {}, json: undefined, cancel: false };
    // The body is only replaced when a hook actually changed it: comparing against a re-serialised copy (not the raw
    // string) means untouched requests keep their exact bytes (numbers like 1.0, whitespace, key order, big integers).
    let baseline;
    if (typeof ctx.init.body === 'string') {
      try {
        ctx.json = JSON.parse(ctx.init.body);
        baseline = JSON.stringify(ctx.json);
      } catch (_) {}
    }
    for (const h of hooks) {
      try {
        h.before(ctx);
      } catch (err) {
        YM.log.error('fetch hook failed', err);
      }
    }
    if (ctx.cancel) return Promise.reject(new DOMException('Cancelled by YapCord', 'AbortError'));
    if (ctx.json !== undefined) {
      const after = JSON.stringify(ctx.json);
      if (after !== baseline) ctx.init.body = after;
    }
    const promise = nativeFetch.call(this, input, ctx.init);
    if (hooks.some((h) => typeof h.after === 'function')) {
      // Observe the response without touching what the caller receives (a clone is read asynchronously).
      promise.then(
        (res) => {
          for (const h of hooks) {
            if (typeof h.after !== 'function') continue;
            let copy;
            try {
              copy = res.clone();
            } catch (_) {
              continue;
            }
            Promise.resolve()
              .then(() => h.after(ctx, copy))
              .catch((err) => YM.log.error('fetch after-hook failed', err));
          }
        },
        () => undefined,
      );
    }
    return promise;
  };
  patchedFetch.__ym = true;
  window.fetch = patchedFetch;
}

// ---- message events (outgoing) -----------------------------------------------------------------
// Plugins can rewrite the text of a message right before it is sent or edited.
const preSend = new Set();
const preEdit = new Set();
YM.messageEvents = {
  /** fn({ content, channelId, row }) may assign msg.content. Return nothing. */
  addPreSendListener(fn) {
    preSend.add(fn);
    return () => preSend.delete(fn);
  },
  addPreEditListener(fn) {
    preEdit.add(fn);
    return () => preEdit.delete(fn);
  },
};

function runContentHooks(set, rows) {
  for (const row of rows) {
    if (!row || typeof row.content !== 'string') continue;
    for (const fn of set) {
      const msg = { content: row.content, channelId: row.channel_id, row };
      try {
        fn(msg);
      } catch (err) {
        YM.log.error('message hook failed', err);
        continue;
      }
      if (typeof msg.content === 'string' && msg.content !== row.content) row.content = msg.content;
    }
  }
}

const MSG_URL = /\/rest\/v1\/messages(\?|$)/;
Net.onFetch({
  test: (url, method) => (method === 'POST' || method === 'PATCH') && MSG_URL.test(url),
  before(ctx) {
    if (ctx.json === undefined) return;
    const rows = Array.isArray(ctx.json) ? ctx.json : [ctx.json];
    runContentHooks(ctx.method === 'POST' ? preSend : preEdit, rows);
  },
});
