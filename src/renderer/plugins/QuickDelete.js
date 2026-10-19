// QuickDelete: hold Shift over one of your messages and the three dots turn into a delete button.
// Click it and the message is deleted straight away, without Yapper's "are you sure" window (you can switch that back on).
// It uses Yapper's own delete, so it can only delete what you could already delete.
(function () {
  const TRASH = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5'/></svg>\")";

  /** Who may use the quick button: your own messages, and everybody's if you are staff in Yapper. */
  function canDelete(message, state) {
    if (!message || !state || message.pending) return false;
    if (message.author_id && message.author_id === state.userId) return true;
    return !!(state.isAdmin || state.isMod);
  }

  YM.definePlugin({
    name: 'QuickDelete',
    description: 'Hold Shift over your message and the three dots turn into a delete button. One click deletes it, no extra window.',
    authors: ['YapCord'],
    tags: ['Chat', 'Utility'],
    api: { canDelete },
    options: {
      confirm: { type: 'boolean', default: false, description: 'Still ask "Delete this message?" before deleting' },
    },
    start(ctx) {
      const actions = YM.finder.lazy(['deleteMessage', 'sendMessage']);
      const root = document.documentElement;
      const setShift = (on) => { if (on) root.setAttribute('data-ym-shift', ''); else root.removeAttribute('data-ym-shift'); };
      const onKey = (e) => { if (e.key === 'Shift') setShift(e.type === 'keydown'); };
      const onMove = (e) => { if (root.hasAttribute('data-ym-shift') !== e.shiftKey) setShift(e.shiftKey); };
      const onBlur = () => setShift(false);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('keyup', onKey, true);
      document.addEventListener('mousemove', onMove, true);
      window.addEventListener('blur', onBlur);

      ctx.css(`
html[data-ym-shift] .msg[data-ym-qd] .msg-actions .icon-btn[aria-label="More"]{color:var(--danger,#ed4245)!important;background:rgba(237,66,69,.16)!important}
html[data-ym-shift] .msg[data-ym-qd] .msg-actions .icon-btn[aria-label="More"] svg{display:none}
html[data-ym-shift] .msg[data-ym-qd] .msg-actions .icon-btn[aria-label="More"]::after{content:"";display:block;width:18px;height:18px;background:currentColor;-webkit-mask:${TRASH} center/contain no-repeat;mask:${TRASH} center/contain no-repeat}
`);

      ctx.cleanup(YM.messages.decorate(({ el, message }) => {
        const ok = canDelete(message, YM.Store.getState()) && !el.querySelector('.webhook-author');
        if (ok) { if (!el.hasAttribute('data-ym-qd')) el.setAttribute('data-ym-qd', ''); } else if (el.hasAttribute('data-ym-qd')) el.removeAttribute('data-ym-qd');
      }));

      ctx.on('store:change', (st, prev) => { if (st.isAdmin !== prev.isAdmin || st.isMod !== prev.isMod || st.userId !== prev.userId) YM.messages.refresh(); });

      const remove = (id) => {
        const mod = actions();
        if (!mod) { YM.toast('Could not find Yapper\'s delete function.', { type: 'error' }); return; }
        Promise.resolve(mod.deleteMessage(id)).catch((err) => YM.toast('Could not delete: ' + ((err && err.message) || err), { type: 'error' }));
      };
      const onClick = (e) => {
        if (!e.shiftKey || !(e.target instanceof Element)) return;
        const btn = e.target.closest('.msg[data-ym-qd] .msg-actions .icon-btn[aria-label="More"]');
        if (!btn) return;
        const row = btn.closest('.msg[data-message-id]');
        if (!row) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const id = row.getAttribute('data-message-id');
        if (!ctx.settings.store.confirm) { remove(id); return; }
        const msg = YM.Store.findMessage(id);
        YM.modal.open({
          title: 'Delete this message?',
          subtitle: 'This cannot be undone.',
          body: YM.dom.h('div', { class: 'msg-text', style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '160px', overflow: 'auto' } }, msg && msg.content ? msg.content : '(a picture or file)'),
          buttons: [{ label: 'Delete', danger: true, onClick: (close) => { close(); remove(id); } }],
        });
      };
      document.addEventListener('click', onClick, true);

      ctx.cleanup(() => {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('keyup', onKey, true);
        document.removeEventListener('mousemove', onMove, true);
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('click', onClick, true);
        setShift(false);
        document.querySelectorAll('.msg[data-ym-qd]').forEach((n) => n.removeAttribute('data-ym-qd'));
      });
    },
  });
})();
