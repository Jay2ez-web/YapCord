// ViewRaw (port): see the raw data of any message, copy it as JSON.
(function () {
  const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>';

  function rawOf(message) {
    if (!message) return null;
    const author = YM.Store.profile(message.author_id);
    return { message, author: author ? { id: author.id, username: author.username, display_name: author.display_name } : null };
  }

  function openModal(id) {
    const h = YM.dom.h;
    const message = YM.Store.findMessage(id);
    const data = rawOf(message);
    document.querySelectorAll('.ym-raw-modal').forEach((n) => n.remove());
    const text = data ? JSON.stringify(data, null, 2) : 'This message is not loaded any more.';
    const close = () => { modal.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const copy = (what, label) => h('button', { type: 'button', class: 'ym-btn ym-btn-small', onClick: async () => YM.toast((await YM.util.copyText(what)) ? label + ' copied.' : 'Could not copy.') }, 'Copy ' + label);
    const modal = h('div', { class: 'ym-raw-modal', onClick: (e) => { if (e.target === modal) close(); } },
      h('div', { class: 'ym-raw-card', role: 'dialog', 'aria-label': 'Raw message' },
        h('div', { class: 'ym-raw-head' }, h('b', {}, 'Raw message'), h('span', { class: 'ym-hint' }, id)),
        h('pre', { class: 'ym-raw-pre' }, text),
        h('div', { class: 'ym-raw-foot' }, copy(text, 'JSON'), message && message.content ? copy(message.content, 'content') : null, h('button', { type: 'button', class: 'ym-btn ym-btn-ghost ym-btn-small', onClick: close }, 'Close'))));
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(modal);
    return modal;
  }

  YM.definePlugin({
    name: 'ViewRaw',
    description: 'Adds a button to messages that shows the raw message data and lets you copy it as JSON or as plain text.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Developer', 'Utility'],
    api: { openModal, rawOf },
    start(ctx) {
      const h = YM.dom.h;
      ctx.css(`.ym-raw-modal{position:fixed;inset:0;z-index:2147482000;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:24px}
.ym-raw-card{width:min(720px,100%);max-height:80vh;display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:12px;background:var(--bg-elev,#222329);color:var(--text,#f2f3f5);border:1px solid var(--border,rgba(255,255,255,.1));box-shadow:0 12px 48px rgba(0,0,0,.5)}
.ym-raw-head{display:flex;gap:10px;align-items:baseline}.ym-raw-pre{margin:0;overflow:auto;padding:12px;border-radius:8px;background:rgba(0,0,0,.3);font:12px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;user-select:text}
.ym-raw-foot{display:flex;gap:8px;justify-content:flex-end}`);
      ctx.cleanup(YM.messages.decorate(({ el, id, message }) => {
        const actions = el.querySelector(':scope > .msg-actions, :scope .msg-actions');
        if (!actions) return;
        const btn = actions.querySelector('.ym-raw-btn');
        if (message && !btn) {
          actions.prepend(h('button', { class: 'icon-btn ym-raw-btn', type: 'button', title: 'View raw', 'aria-label': 'View raw', html: ICON, onClick: (e) => { e.stopPropagation(); openModal(id); } }));
        }
      }));
      ctx.cleanup(() => { document.querySelectorAll('.ym-raw-btn,.ym-raw-modal').forEach((n) => n.remove()); });
    },
  });
})();
