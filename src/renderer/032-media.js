// Notifications, sounds and the desktop badge.
// - Notification filter hook (used by OnePingPerDM and friends)
// - Web Audio start() filter: a muted node is disconnected before it starts, so stop()/onended keep working
// - window.yapperDesktop shim: Yapper already calls setBadge()/onActivity() when it runs inside its own desktop app

const Media = (YM.media = { notificationsSeen: 0, notificationsBlocked: 0, soundsSeen: 0, soundsBlocked: 0 });

// ---- Notification ------------------------------------------------------------------------------
const notifyFilters = new Set();
/** fn(title, options) -> false to drop the notification. */
Media.onNotification = (fn) => {
  notifyFilters.add(fn);
  return () => notifyFilters.delete(fn);
};

const NativeNotification = window.Notification;
if (NativeNotification && !NativeNotification.__ym) {
  const PatchedNotification = function (title, options) {
    Media.notificationsSeen++;
    if (notifyFilters.size) {
      for (const fn of notifyFilters) {
        let verdict;
        try {
          verdict = fn(title, options || {});
        } catch (err) {
          YM.log.error('notification filter failed', err);
        }
        if (verdict === false) {
          Media.notificationsBlocked++;
          // Same surface as a real notification so the caller's `n.onclick = ...; n.close()` keeps working.
          return {
            title,
            close() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent: () => false,
            onclick: null,
            onclose: null,
            onerror: null,
            onshow: null,
          };
        }
      }
    }
    return arguments.length > 1 ? new NativeNotification(title, options) : new NativeNotification(title);
  };
  PatchedNotification.prototype = NativeNotification.prototype;
  Object.setPrototypeOf(PatchedNotification, NativeNotification);
  Object.defineProperty(PatchedNotification, '__ym', { value: true });
  window.Notification = PatchedNotification;
}

// ---- Web Audio ---------------------------------------------------------------------------------
const soundFilters = new Set();
let muteMessageUntil = 0;
let muteAllUntil = 0;
let messageBufferKnown = false;

// Yapper loads its sounds as /sounds/<name>.ogg|mp3 and decodes them with decodeAudioData. We remember which decoded
// buffer came from which file, so a plugin can tell the "message" ping from join/leave/mute chimes.
const bufferNames = new WeakMap();
let lastSoundUrl = '';

function tagBuffer(buffer, url) {
  const m = String(url || '').match(/\/sounds\/([^/?#.]+)\.(?:ogg|mp3|wav)/i);
  if (!buffer || !m) return buffer;
  bufferNames.set(buffer, m[1].toLowerCase());
  if (m[1].toLowerCase() === 'message') messageBufferKnown = true;
  return buffer;
}
Media.tagBuffer = (buffer, name) => tagBuffer(buffer, '/sounds/' + name + '.ogg');
/** Name of the file a buffer source plays ("message", "leave", ...), or null. */
Media.soundOf = (node) => (node && node.buffer && bufferNames.get(node.buffer)) || null;

// The most reliable link between a download and its decode is the ArrayBuffer itself: remember which URL each sound's bytes
// came from, so two sounds loading at the same moment (message ping + leave chime) cannot get each other's name.
const bufferUrls = new WeakMap();
const NativeResponse = window.Response;
if (NativeResponse && NativeResponse.prototype && typeof NativeResponse.prototype.arrayBuffer === 'function' && !NativeResponse.prototype.arrayBuffer.__ym) {
  const nativeArrayBuffer = NativeResponse.prototype.arrayBuffer;
  const patchedArrayBuffer = function () {
    const p = nativeArrayBuffer.apply(this, arguments);
    try {
      const url = this.url;
      if (url && /\/sounds\//.test(url) && p && typeof p.then === 'function') {
        p.then((buf) => { if (buf && typeof buf === 'object') bufferUrls.set(buf, String(url)); }, () => undefined);
      }
    } catch (_) { /* ignore */ }
    return p;
  };
  patchedArrayBuffer.__ym = true;
  NativeResponse.prototype.arrayBuffer = patchedArrayBuffer;
}

const nativeFetchForSounds = window.fetch;
if (typeof nativeFetchForSounds === 'function') {
  const wrapped = function (input) {
    try {
      const u = typeof input === 'string' ? input : input && (input.url || input.href);
      if (u && /\/sounds\//.test(u)) lastSoundUrl = String(u);
    } catch (_) { /* ignore */ }
    return nativeFetchForSounds.apply(this, arguments);
  };
  Object.defineProperty(wrapped, '__ym', { value: true });
  window.fetch = wrapped;
}

const BaseCtx = window.BaseAudioContext || window.AudioContext;
if (BaseCtx && BaseCtx.prototype && BaseCtx.prototype.decodeAudioData && !BaseCtx.prototype.decodeAudioData.__ym) {
  const nativeDecode = BaseCtx.prototype.decodeAudioData;
  const patched = function (data, ok, fail) {
    const url = (data && bufferUrls.get(data)) || lastSoundUrl;
    if (!(data && bufferUrls.has(data))) lastSoundUrl = '';
    const done = ok ? (b) => ok(tagBuffer(b, url)) : undefined;
    const p = nativeDecode.call(this, data, done, fail);
    return p && p.then ? p.then((b) => tagBuffer(b, url)) : p;
  };
  patched.__ym = true;
  BaseCtx.prototype.decodeAudioData = patched;
}

/** fn({ kind: 'buffer' | 'oscillator', node }) -> false to mute this sound. */
Media.onSound = (fn) => {
  soundFilters.add(fn);
  return () => soundFilters.delete(fn);
};
/** Mute every sound that starts during the next `ms` milliseconds. */
Media.muteFor = (ms) => {
  muteAllUntil = Math.max(muteAllUntil, Date.now() + ms);
};
/** Mute only Yapper's message ping during the next `ms` milliseconds. */
Media.muteMessageSound = (ms) => {
  muteMessageUntil = Math.max(muteMessageUntil, Date.now() + ms);
};

function wrapStart(Cls, kind) {
  if (!Cls || !Cls.prototype || Cls.prototype.start.__ym) return;
  const orig = Cls.prototype.start;
  const patched = function (...args) {
    Media.soundsSeen++;
    const now = Date.now();
    let mute = now < muteAllUntil;
    if (!mute && now < muteMessageUntil) {
      // The message ping is a decoded buffer; if its file never decoded, Yapper falls back to synthesized chimes.
      mute = kind === 'buffer' ? Media.soundOf(this) === 'message' : !messageBufferKnown && this.type === 'sine';
    }
    if (!mute && soundFilters.size) {
      for (const fn of soundFilters) {
        try {
          if (fn({ kind, node: this }) === false) {
            mute = true;
            break;
          }
        } catch (err) {
          YM.log.error('sound filter failed', err);
        }
      }
    }
    if (mute) {
      Media.soundsBlocked++;
      try {
        this.disconnect();
      } catch (_) {
        /* not connected */
      }
    }
    return orig.apply(this, args);
  };
  patched.__ym = true;
  Cls.prototype.start = patched;
}
wrapStart(window.AudioBufferSourceNode, 'buffer');
wrapStart(window.OscillatorNode, 'oscillator');

// ---- Desktop badge (window.yapperDesktop) ------------------------------------------------------
function badgeIcon(count) {
  if (count <= 0) return '';
  try {
    const size = 32;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#e5484d';
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const text = count > 99 ? '99+' : String(count);
    g.font = '700 ' + (text.length > 2 ? 15 : text.length > 1 ? 19 : 22) + 'px sans-serif';
    g.fillText(text, size / 2, size / 2 + 1);
    return c.toDataURL('image/png');
  } catch (_) {
    return '';
  }
}

Media.badge = 0;
Media.badgeEnabled = true;
Media.setBadge = (count) => {
  count = Math.max(0, Math.floor(Number(count) || 0));
  Media.badge = count;
  YM.Events.emit('badge', count);
  const shown = Media.badgeEnabled ? count : 0;
  try {
    const r = YM.native.setBadge(shown, badgeIcon(shown));
    if (r && r.catch) r.catch(() => undefined);
  } catch (_) {
    /* running outside the app */
  }
};

if (!window.yapperDesktop) {
  Object.defineProperty(window, 'yapperDesktop', {
    configurable: true,
    enumerable: true,
    value: Object.freeze({
      isYapperMod: true,
      platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '',
      setBadge: (n) => Media.setBadge(n),
      // Yapper uses this to read "now playing"/game activity from the desktop app. YapCord does not detect games.
      onActivity: () => () => undefined,
    }),
  });
}
