// CustomFontFiles: import your own font files (.ttf / .otf / .woff / .woff2) and use them in Yapper.
//
// - Import from Settings > Plugins > CustomFontFiles (Import button) or the Aa button by the composer
// - Fonts are stored in IndexedDB (no 5MB localStorage limit) and re-applied on every launch
// - Pick which imported font is active; delete ones you don't want

(function () {
  const DB_NAME = 'yapcord-fonts';
  const DB_STORE = 'fonts';
  const FAMILY_PREFIX = 'YM-Custom-';
  const apiHolder = { api: null };

  function openDb() {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }
  function putFont(record) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      try {
        const t = db.transaction(DB_STORE, 'readwrite');
        t.objectStore(DB_STORE).put(record);
        t.oncomplete = () => { db.close(); resolve(); };
        t.onerror = () => { db.close(); reject(t.error); };
      } catch (err) {
        try { db.close(); } catch (_) {}
        reject(err);
      }
    }));
  }
  function deleteFont(id) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      try {
        const t = db.transaction(DB_STORE, 'readwrite');
        t.objectStore(DB_STORE).delete(id);
        t.oncomplete = () => { db.close(); resolve(); };
        t.onerror = () => { db.close(); reject(t.error); };
      } catch (err) {
        try { db.close(); } catch (_) {}
        reject(err);
      }
    }));
  }
  function getFonts() {
    return openDb().then((db) => new Promise((resolve, reject) => {
      try {
        const t = db.transaction(DB_STORE, 'readonly');
        const req = t.objectStore(DB_STORE).getAll();
        req.onsuccess = () => { db.close(); resolve(req.result || []); };
        req.onerror = () => { db.close(); reject(req.error); };
      } catch (err) {
        try { db.close(); } catch (_) {}
        reject(err);
      }
    }));
  }

  function guessFormat(name, blobType) {
    const n = (name || '').toLowerCase();
    const t = (blobType || '').toLowerCase();
    if (/woff2/.test(n) || /woff2/.test(t)) return 'woff2';
    if (/woff/.test(n) || /font-woff/.test(t)) return 'woff';
    if (/otf/.test(n) || /opentype/.test(t)) return 'opentype';
    return 'truetype';
  }

  function baseFamily(name) {
    return (name || 'custom').replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'custom';
  }

  function pickFromDisk() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ttf,.otf,.woff,.woff2';
      input.multiple = true;
      input.style.display = 'none';
      let done = false;
      const finish = (files) => {
        if (done) return;
        done = true;
        window.removeEventListener('focus', onFocus, true);
        input.remove();
        resolve(files);
      };
      const onFocus = () => setTimeout(() => {
        if (!done && (!input.files || !input.files.length)) finish([]);
      }, 400);
      input.onchange = () => finish([...(input.files || [])]);
      window.addEventListener('focus', onFocus, true);
      document.body.append(input);
      input.click();
    });
  }

  YM.definePlugin({
    name: 'CustomFontFiles',
    description: 'Import .ttf/.otf/.woff/.woff2 files from disk and use them as Yapper\u2019s font. Stored in IndexedDB, applied on launch.',
    authors: ['YapCord'],
    tags: ['Appearance'],
    enabledByDefault: false,
    options: {
      enabledFontId: { type: 'string', default: '', description: 'Internal: id of the active font (managed by the font list below)' },
      fontSize: { type: 'number', default: 15, min: 10, max: 24, step: 1, description: 'Base chat font size in px' },
      applyEverywhere: { type: 'boolean', default: true, description: 'Apply to the whole app (off = chat messages only)' },
      fallback: { type: 'string', default: 'sans-serif', description: 'Fallback stack after your font (e.g. sans-serif, Inter, system-ui)' },
      list: {
        type: 'custom',
        render(container) {
          const h = YM.dom.h;
          const box = h('div', { class: 'ym-fonts' });
          container.append(box);
          const paint = async () => {
            if (!box.isConnected) return;
            box.innerHTML = '';
            let fonts = [];
            try {
              fonts = await getFonts();
            } catch (_) { /* IndexedDB blocked */ }
            const store = YM.plugins.get('CustomFontFiles').settings.store;
            const api = apiHolder.api;
            box.append(
              h('div', { class: 'ym-row' },
                h('button', {
                  class: 'ym-btn ym-btn-primary ym-btn-small', type: 'button',
                  onClick: () => api && api.importFiles().then(paint),
                }, 'Import font files\u2026'),
                h('span', { class: 'ym-hint' }, fonts.length ? `${fonts.length} imported` : 'No fonts yet (.ttf, .otf, .woff, .woff2)'),
              ),
            );
            fonts.forEach((f) => {
              const isActive = store.enabledFontId === f.id || (!store.enabledFontId && fonts[0] === f);
              box.append(h('div', { class: 'ym-font-row' },
                h('span', { class: 'ym-font-name', style: { fontFamily: `'${FAMILY_PREFIX}${f.family}', sans-serif` } }, f.name),
                h('button', {
                  class: 'ym-btn ym-btn-small', type: 'button',
                  onClick: async () => {
                    store.enabledFontId = f.id;
                    await api.apply();
                    paint();
                  },
                }, store.enabledFontId === f.id ? 'Using ✓' : 'Use'),
                h('button', {
                  class: 'ym-link ym-danger', type: 'button', title: 'Delete this font',
                  onClick: async () => {
                    if (!confirm(`Delete font "${f.name}"?`)) return;
                    await api.remove(f.id);
                    paint();
                  },
                }, 'delete'),
              ));
              void isActive;
            });
          };
          paint();
          YM.Events.on('ym:fonts-changed', paint);
        },
      },
    },

    async start(ctx) {
      await YM.Store.ready.catch(() => undefined);
      if (!YM.plugins.isRunning('CustomFontFiles')) return;

      const api = {
        async importFiles() {
          let files = null;
          try {
            if (YM.native.files && YM.native.files.pick) {
              const picked = await YM.native.files.pick({ accept: '.ttf,.otf,.woff,.woff2,font/*', multiple: true });
              if (picked && picked.length) files = picked;
            }
          } catch (_) { /* fall through to file input */ }
          if (!files) files = await pickFromDisk();
          if (!files || !files.length) return;
          let added = 0;
          for (const file of files) {
            if (!/\.(ttf|otf|woff2?)$/i.test(file.name || '')) continue;
            await putFont({
              id: 'font_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
              name: file.name,
              family: baseFamily(file.name),
              format: guessFormat(file.name, file.type),
              blob: file,
              addedAt: Date.now(),
            });
            added++;
          }
          YM.toast(added ? `Imported ${added} font${added === 1 ? '' : 's'}` : 'No font files selected', { type: added ? 'success' : 'error' });
          await api.apply();
          YM.Events.emit('ym:fonts-changed');
        },
        async remove(id) {
          await deleteFont(id);
          if (ctx.settings.store.enabledFontId === id) ctx.settings.set('enabledFontId', '');
          await api.apply();
          YM.Events.emit('ym:fonts-changed');
        },
        async apply() {
          let css = '';
          try {
            const fonts = await getFonts();
            if (ctx._fontUrls) ctx._fontUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
            ctx._fontUrls = [];
            for (const f of fonts) {
              try {
                const url = URL.createObjectURL(f.blob);
                ctx._fontUrls.push(url);
                css += `@font-face{font-family:'${FAMILY_PREFIX}${f.family}';src:url('${url}') format('${f.format}');font-display:swap;}\n`;
              } catch (_) { /* unreadable blob */ }
            }
            const active = fonts.find((f) => f.id === ctx.settings.store.enabledFontId) || fonts[0];
            const size = Math.max(10, Math.min(24, Number(ctx.settings.store.fontSize) || 15));
            if (active) {
              const fb = (ctx.settings.store.fallback || 'sans-serif').split(',').map((s) => s.trim()).filter(Boolean).join(',') || 'sans-serif';
              const fam = `'${FAMILY_PREFIX}${active.family}',${fb}`;
              css += ctx.settings.store.applyEverywhere
                ? `body,body *{font-family:${fam}!important}\nbody{font-size:${size}px}\n`
                : `.msg-text,.msg-body{font-family:${fam}!important;font-size:${size}px}\n`;
            }
          } catch (err) {
            ctx.log.warn('font apply failed', err);
          }
          YM.dom.css.set('plugin-CustomFontFiles', css);
        },
      };
      apiHolder.api = api;
      YM.plugins.get('CustomFontFiles').api = api;

      const h = YM.dom.h;
      const offWatch = YM.dom.watch('.composer', (composer) => {
        if (composer.querySelector('.ym-font-btn')) return;
        const btn = h('button', {
          class: 'ym-font-btn icon-btn', type: 'button', title: 'Import font file', 'aria-label': 'Import font file',
          html: '<span aria-hidden="true" style="font-weight:700">Aa</span>',
          onClick: (e) => { e.stopPropagation(); api.importFiles(); },
        });
        const sendBtn = composer.querySelector('button[type=submit], .send-btn, [class*=send i]');
        if (sendBtn && sendBtn.parentNode) sendBtn.parentNode.insertBefore(btn, sendBtn);
        else composer.append(btn);
      });

      const offSettings = ctx.settings.onChange(() => api.apply());
      await api.apply();

      ctx.cleanup(() => {
        try { offWatch && offWatch(); } catch (_) {}
        try { offSettings && offSettings(); } catch (_) {}
        try { (ctx._fontUrls || []).forEach((u) => URL.revokeObjectURL(u)); } catch (_) {}
        document.querySelectorAll('.ym-font-btn').forEach((n) => n.remove());
        YM.dom.css.remove('plugin-CustomFontFiles');
        apiHolder.api = null;
      });

      ctx.css(`
.ym-fonts{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.ym-fonts .ym-row{display:flex;gap:8px;align-items:center}
.ym-font-row{display:flex;gap:8px;align-items:center;padding:4px 0;border-top:1px solid rgba(255,255,255,.07)}
.ym-font-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
.ym-link.ym-danger{color:var(--danger,#e5484d)}
`);
    },
  });
})();
