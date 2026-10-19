// AutoTranslate: inline translation below foreign messages, right-click translate, target language,
// per-user ignore list, and a two-layer cache (memory + localStorage).
//
// Provider: Google's free gtx endpoint (no key). If it fails/rate-limits, falls back to MyMemory.
// Performance: an in-memory Map avoids re-parsing the whole localStorage cache for every message,
// localStorage writes are debounced, and at most 3 translations run concurrently (channel switches
// no longer fire off dozens of requests at once).

(function () {
  const LS_CACHE = 'yapcord:translate-cache:v1';
  const MAX_CACHE = 500;
  const MAX_FLIGHT = 3;

  const LANGS = [
    ['English', 'en'], ['Spanish', 'es'], ['French', 'fr'], ['German', 'de'],
    ['Portuguese', 'pt'], ['Italian', 'it'], ['Dutch', 'nl'], ['Russian', 'ru'],
    ['Japanese', 'ja'], ['Korean', 'ko'], ['Chinese (Simplified)', 'zh-CN'],
    ['Arabic', 'ar'], ['Hindi', 'hi'], ['Turkish', 'tr'], ['Polish', 'pl'],
  ];

  // ---- cache (memory first, localStorage second) -------------------------------------------
  const mem = new Map();
  let memLoaded = false;
  let saveTimer = null;
  function loadMem() {
    if (memLoaded) return;
    memLoaded = true;
    try {
      const obj = JSON.parse(localStorage.getItem(LS_CACHE) || '{}');
      for (const [k, v] of Object.entries(obj)) {
        mem.set(k, v);
        if (mem.size >= MAX_CACHE) break;
      }
    } catch (_) { /* corrupt cache: start empty */ }
  }
  function saveMemSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const obj = {};
        let i = 0;
        for (const [k, v] of mem) {
          obj[k] = v;
          if (++i >= MAX_CACHE) break;
        }
        localStorage.setItem(LS_CACHE, JSON.stringify(obj));
      } catch (_) {
        try { localStorage.removeItem(LS_CACHE); } catch (_) {}
      }
    }, 2000);
  }

  function hash(s) {
    let x = 5381;
    for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0;
    return (x >>> 0).toString(36);
  }
  function parseIgnore(str) {
    return new Set(String(str || '').split(/[\s,;]+/).filter(Boolean));
  }
  function looksForeign(text) {
    if (!text || text.length < 2) return false;
    // Strip emoji first so emoji-only messages are never "foreign".
    const withoutEmoji = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '');
    if (!withoutEmoji.trim()) return false;
    return /[^\x00-\x7F]/.test(withoutEmoji);
  }

  // ---- concurrency cap ---------------------------------------------------------------------
  let flying = 0;
  const queue = [];
  function limited(fn) {
    return new Promise((resolve, reject) => {
      const run = () => {
        flying++;
        fn().then(
          (v) => { flying--; pump(); resolve(v); },
          (e) => { flying--; pump(); reject(e); },
        );
      };
      queue.push(run);
      pump();
    });
  }
  function pump() {
    while (flying < MAX_FLIGHT && queue.length) queue.shift()();
  }

  async function translate(text, target) {
    loadMem();
    const key = target + ':' + hash(text);
    if (mem.has(key)) return mem.get(key);
    const entry = await limited(async () => {
      // 1) Google gtx.
      try {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl='
          + encodeURIComponent(target) + '&dt=t&q=' + encodeURIComponent(text);
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const out = (data && data[0] || []).map((part) => part[0]).join('');
          const src = (data && data[2]) || 'auto';
          if (out && out.trim() && out.trim().toLowerCase() !== text.trim().toLowerCase()) {
            return { text: out, src };
          }
          return { text: '', src, same: true };
        }
      } catch (_) { /* fall through to MyMemory */ }
      // 2) MyMemory fallback.
      const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text)
        + '&langpair=auto|' + encodeURIComponent(target);
      const res = await fetch(url);
      if (!res.ok) throw new Error('translation failed');
      const data = await res.json();
      const out = data && data.responseData && data.responseData.translatedText;
      if (out && out.trim().toLowerCase() !== text.trim().toLowerCase()) return { text: out, src: 'auto' };
      return { text: '', same: true, src: 'auto' };
    });
    mem.set(key, entry);
    if (mem.size > MAX_CACHE + 50) {
      // Trim oldest (Maps iterate in insertion order).
      for (const k of mem.keys()) {
        mem.delete(k);
        if (mem.size <= MAX_CACHE) break;
      }
    }
    saveMemSoon();
    return entry;
  }

  YM.definePlugin({
    name: 'AutoTranslate',
    description: 'Inline translation below foreign messages, 🌐 button per message, target language, per-user ignore list, memory + localStorage cache.',
    authors: ['YapCord'],
    tags: ['Chat', 'Utility'],
    enabledByDefault: false,
    options: {
      targetLang: {
        type: 'select', default: 'en', description: 'Translate messages into this language',
        options: LANGS.map(([label, value]) => ({ label, value })),
      },
      autoTranslate: { type: 'boolean', default: true, description: 'Automatically translate foreign messages inline' },
      ignoredUsers: { type: 'string', default: '', description: 'User IDs to never translate (comma separated)' },
      showSource: { type: 'boolean', default: true, description: 'Show detected source language next to the translation' },
    },
    start(ctx) {
      const h = YM.dom.h;
      const pending = new Set();
      const manual = new Set(); // message ids the user explicitly asked to translate
      let ignoreCache = { raw: null, set: null };

      function ignored(authorId) {
        const raw = ctx.settings.store.ignoredUsers || '';
        if (ignoreCache.raw !== raw) ignoreCache = { raw, set: parseIgnore(raw) };
        return ignoreCache.set.has(authorId);
      }

      function boxFor(body) {
        let box = body.querySelector(':scope > .ym-tr');
        if (!box) {
          box = h('div', { class: 'ym-tr', hidden: true });
          body.append(box);
        }
        return box;
      }

      async function runFor(id, body, message) {
        const st = ctx.settings.store;
        const text = (message && message.content || '').trim();
        if (!text || text.length > 2000 || ignored(message.author_id)) return;
        const auto = st.autoTranslate && looksForeign(text);
        if (!auto && !manual.has(id)) return;
        if (pending.has(id)) return;
        const box = boxFor(body);
        if (box.dataset.done === id) return;
        pending.add(id);
        if (!box.textContent) {
          box.hidden = false;
          box.textContent = 'Translating…';
        }
        try {
          const entry = await translate(text, st.targetLang || 'en');
          if (!box.isConnected) return;
          box.innerHTML = '';
          if (entry.same) {
            box.hidden = true;
            box.dataset.done = id;
            return;
          }
          const label = st.showSource && entry.src ? ' (' + entry.src + ' → ' + (st.targetLang || 'en') + ')' : '';
          box.append(
            h('span', { class: 'ym-tr-text' }, entry.text),
            h('span', { class: 'ym-tr-meta' }, label + ' · auto'),
          );
          box.hidden = false;
          box.dataset.done = id;
        } catch (_) {
          if (box.isConnected && !box.dataset.done) {
            box.hidden = false;
            box.textContent = 'Translation failed — click 🌐 to retry';
          }
        } finally {
          pending.delete(id);
        }
      }

      const offDecorate = YM.messages.decorate(({ el, id, message, body }) => {
        if (!body || !id) return;
        const msg = message || YM.Store.findMessage(id);
        if (!msg || typeof msg.content !== 'string') return;
        const actions = el.querySelector(':scope > .msg-actions');
        if (actions && !actions.querySelector('.ym-tr-btn')) {
          actions.prepend(h('button', {
            class: 'icon-btn ym-tr-btn', type: 'button', title: 'Translate message', 'aria-label': 'Translate message',
            html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z"/></svg>',
            onClick: (e) => {
              e.stopPropagation();
              manual.add(id);
              const b = boxFor(body);
              delete b.dataset.done;
              b.hidden = false;
              b.textContent = 'Translating…';
              runFor(id, body, YM.Store.findMessage(id) || msg);
            },
          }));
        }
        runFor(id, body, msg);
      });

      // Shift+RightClick a message = translate it (works alongside Yapper's own menu).
      const onContext = (e) => {
        const row = e.target instanceof Element && e.target.closest('.msg[data-message-id]');
        if (!row || !e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();
        const mid = row.getAttribute('data-message-id');
        const mbody = row.querySelector(':scope > .msg-body');
        const msg = YM.Store.findMessage(mid);
        if (mid && mbody && msg) {
          manual.add(mid);
          runFor(mid, mbody, msg);
          YM.toast('Translating message…', { type: 'info' });
        }
      };
      document.addEventListener('contextmenu', onContext, true);

      const offSettings = ctx.settings.onChange((key) => {
        if (key === 'targetLang' || key === 'autoTranslate' || key === 'ignoredUsers') {
          document.querySelectorAll('.ym-tr').forEach((n) => { delete n.dataset.done; n.hidden = true; n.innerHTML = ''; });
          manual.clear();
          YM.messages.refresh();
        }
      });

      ctx.cleanup(() => {
        clearTimeout(saveTimer);
        try { offDecorate && offDecorate(); } catch (_) {}
        document.removeEventListener('contextmenu', onContext, true);
        try { offSettings && offSettings(); } catch (_) {}
        document.querySelectorAll('.ym-tr,.ym-tr-btn').forEach((n) => n.remove());
      });

      ctx.css(`
.ym-tr { margin-top: 4px; padding: 6px 10px; border-left: 3px solid var(--accent, #7c5cff); background: color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent); border-radius: 0 8px 8px 0; font-size: 13px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
.ym-tr-text { color: var(--text); }
.ym-tr-meta { margin-left: 6px; font-size: 11px; color: var(--text-muted); }
.ym-tr-btn { opacity: .7; } .ym-tr-btn:hover { opacity: 1; }
`);
      YM.messages.refresh();
    },
  });
})();
