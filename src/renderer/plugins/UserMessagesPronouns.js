// UserMessagesPronouns (port): show people's pronouns (from their Yapper profile) next to their name in chat.
(function () {
  YM.definePlugin({
    name: 'UserMessagesPronouns',
    description: 'Shows pronouns from user profiles next to their name in messages.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Appearance', 'Chat'],
    start(ctx) {
      const h = YM.dom.h;
      ctx.cleanup(YM.messages.decorate(({ el, message }) => {
        const author = el.querySelector(':scope > .msg-body > .msg-head > .msg-author:not(.webhook-author)');
        if (!author) return;
        const existing = author.parentNode.querySelector(':scope > .ym-pronouns');
        const p = message && YM.Store.profile(message.author_id);
        const text = p && typeof p.pronouns === 'string' ? p.pronouns.trim() : '';
        if (!text) {
          if (existing) existing.remove();
          return;
        }
        if (existing) {
          if (existing.textContent !== text) existing.textContent = text;
          return;
        }
        const after = author.parentNode.querySelector(':scope > .ym-sm-name') || author;
        after.after(h('span', { class: 'ym-pronouns', title: 'Pronouns' }, text));
      }));
      ctx.cleanup(() => document.querySelectorAll('.ym-pronouns').forEach((n) => n.remove()));
      ctx.css('.ym-pronouns{margin-left:6px;font-size:11px;color:var(--text-faint,#6e6f7b);border:1px solid var(--border);border-radius:6px;padding:0 5px}');
    },
  });
})();
