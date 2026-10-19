// ShowMeYourName (port): show the @username next to a display name in chat.
(function () {
  YM.definePlugin({
    name: 'ShowMeYourName',
    description: 'Shows the @username next to the display name in messages.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Appearance', 'Chat'],
    options: {
      onlyWhenDifferent: { type: 'boolean', default: true, description: 'Only when the display name differs from the username' },
    },
    start(ctx) {
      const h = YM.dom.h;
      const s = ctx.settings.store;
      const apply = ({ el, message }) => {
        const author = el.querySelector(':scope > .msg-body > .msg-head > .msg-author:not(.webhook-author)');
        if (!author) return;
        const existing = author.parentNode.querySelector(':scope > .ym-sm-name');
        const p = message && YM.Store.profile(message.author_id);
        const want = p && p.username && (!s.onlyWhenDifferent || (p.display_name && p.display_name !== p.username));
        if (!want) {
          if (existing) existing.remove();
          return;
        }
        const text = '@' + p.username;
        if (existing) {
          if (existing.textContent !== text) existing.textContent = text;
          return;
        }
        author.after(h('span', { class: 'ym-sm-name' }, text));
      };
      ctx.cleanup(YM.messages.decorate(apply));
      ctx.cleanup(ctx.settings.onChange(() => YM.messages.refresh()));
      ctx.cleanup(() => document.querySelectorAll('.ym-sm-name').forEach((n) => n.remove()));
      ctx.css('.ym-sm-name{margin-left:6px;font-size:12px;color:var(--text-faint,#6e6f7b);font-weight:500}');
    },
  });
})();
