// Message Bookmarks (native): save important messages locally, revisit with Ctrl/Cmd+Shift+B.
(function () {
  const KEY = 'yapcordBookmarks';

  YM.definePlugin({
    name: 'Message Bookmarks',
    description: 'Save important messages locally and revisit them with Ctrl/Cmd+Shift+B.',
    authors: ['YapCord'],
    tags: ['Chat', 'Utility'],
    enabledByDefault: true,
    start(ctx) {
      const get = () => {
        try {
          const v = JSON.parse(localStorage.getItem(KEY) || '[]');
          return Array.isArray(v) ? v : [];
        } catch (_) { return []; }
      };
      const save = (v) => localStorage.setItem(KEY, JSON.stringify(v));
      let overlay = null;
      const close = () => { if (overlay) overlay.remove(); overlay = null; };
      const open = () => {
        close();
        overlay = document.createElement('div');
        overlay.className = 'ym-bookmarks-overlay';
        const items = get();
        overlay.innerHTML = '<div class="ym-bookmarks-card"><header><strong>Bookmarks</strong><button type="button">×</button></header><div class="ym-bookmarks-list"></div></div>';
        overlay.querySelector('header button').onclick = close;
        const list = overlay.querySelector('.ym-bookmarks-list');
        if (!items.length) list.textContent = 'No saved messages yet.';
        items.forEach((item, i) => {
          const row = document.createElement('button');
          row.type = 'button';
          row.textContent = item.text;
          row.title = item.channel || 'Saved message';
          row.onclick = () => {
            document.querySelector('[data-message-id="' + CSS.escape(item.id) + '"]')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            close();
          };
          const del = document.createElement('span');
          del.textContent = '×';
          del.onclick = (e) => {
            e.stopPropagation();
            const next = get();
            next.splice(i, 1);
            save(next);
            open();
          };
          row.append(del);
          list.append(row);
        });
        document.body.append(overlay);
      };
      const onKey = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
          e.preventDefault();
          open();
        }
      };
      document.addEventListener('keydown', onKey, true);
      const api = {
        add(message) {
          const text = message.querySelector('.msg-text')?.innerText?.trim() || message.innerText.trim();
          const items = get().filter((x) => x.id !== message.dataset.messageId);
          items.unshift({ id: message.dataset.messageId, text: text.slice(0, 240), savedAt: Date.now() });
          save(items.slice(0, 100));
        },
      };
      YM.plugins.get('Message Bookmarks').api = api;
      ctx.cleanup(() => {
        document.removeEventListener('keydown', onKey, true);
        close();
      });
      ctx.css(`
.ym-bookmarks-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(0,0,0,.55)}
.ym-bookmarks-card{width:min(420px,90vw);max-height:70vh;display:flex;flex-direction:column;background:var(--bg-main);color:var(--text);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.ym-bookmarks-card header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.ym-bookmarks-card header button{background:none;border:none;color:var(--text);font-size:18px;cursor:pointer}
.ym-bookmarks-list{overflow:auto;display:flex;flex-direction:column;gap:6px}
.ym-bookmarks-list>button{display:flex;justify-content:space-between;gap:8px;text-align:left;background:var(--bg-elev);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 10px;cursor:pointer;font:inherit}
.ym-bookmarks-list>button span{opacity:.6}
`);
    },
  });
})();
