// ReplyTimestamp (port): shows when the message you are replying to was sent, inside the reply preview.
(function () {
  function label(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const now = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? time : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + time;
  }

  YM.definePlugin({
    name: 'ReplyTimestamp',
    description: 'Shows the time of the original message in reply previews.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Appearance'],
    api: { label },
    start(ctx) {
      ctx.css('.ym-reply-time{margin-left:6px;font-size:11px;opacity:.6;white-space:nowrap}');
      ctx.cleanup(YM.messages.decorate(({ el, message }) => {
        const prev = el.querySelector(':scope .reply-preview');
        if (!prev || !message || !message.reply_to_id) return;
        const target = YM.Store.findMessage(message.reply_to_id);
        let tag = prev.querySelector('.ym-reply-time');
        if (!target || !target.created_at) { if (tag) tag.remove(); return; }
        const text = label(target.created_at);
        if (!tag) {
          tag = YM.dom.h('span', { class: 'ym-reply-time' });
          const author = prev.querySelector('.reply-author');
          if (author && author.parentNode === prev) author.after(tag); else prev.append(tag);
        }
        if (tag.textContent !== text) tag.textContent = text;
        tag.title = new Date(target.created_at).toLocaleString();
      }));
      ctx.cleanup(() => document.querySelectorAll('.ym-reply-time').forEach((n) => n.remove()));
    },
  });
})();
