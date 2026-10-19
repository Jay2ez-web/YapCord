// QuickMention (port): a button in the message hover bar that puts "@username" in the message box.
(function () {
  const AT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>';

  function insert(text) {
    const ta = document.querySelector('.composer textarea');
    if (!ta) return false;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    const added = pad + text + ' ';
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, before + added + after);
    ta.selectionStart = ta.selectionEnd = (before + added).length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    return true;
  }

  YM.definePlugin({
    name: 'QuickMention',
    description: 'Adds a button to the message hover bar that mentions the author in your message box.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Utility'],
    api: { insert },
    start(ctx) {
      const h = YM.dom.h;
      ctx.cleanup(YM.messages.decorate(({ el, message }) => {
        const actions = el.querySelector(':scope > .msg-actions');
        if (!actions) return;
        const btn = actions.querySelector('.ym-qm-btn');
        const profile = message && !message.webhook ? YM.Store.profile(message.author_id) : null;
        const ok = !!profile && message.author_id !== YM.Store.myId() && !el.matches('.ephemeral,.blocked-msg');
        if (ok && !btn) {
          actions.prepend(h('button', {
            class: 'icon-btn ym-qm-btn', type: 'button', title: 'Mention', 'aria-label': 'Mention', html: AT,
            onClick: (e) => {
              e.stopPropagation();
              const info = YM.messages.info(el);
              const p = info.message && YM.Store.profile(info.message.author_id);
              if (p) insert('@' + p.username);
            },
          }));
        } else if (!ok && btn) btn.remove();
      }));
      ctx.cleanup(() => document.querySelectorAll('.ym-qm-btn').forEach((n) => n.remove()));
    },
  });
})();
