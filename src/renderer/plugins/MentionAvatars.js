// MentionAvatars (port): a small picture of the person in front of an @mention.
(function () {
  YM.definePlugin({
    name: 'MentionAvatars',
    description: 'Shows the avatar of the person inside @mentions in messages.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Appearance'],
    start(ctx) {
      // Only a data attribute and a CSS variable are set: Yapper's own rendering of the mention is left alone.
      const selector = '.msg-text .mention:not(.role):not(.chan),.reply-text .mention:not(.role):not(.chan)';
      const syncMessage = ({ el }) => {
        if (!el || !el.querySelectorAll) return;
        el.querySelectorAll(selector).forEach((mention) => {
          const profile = YM.people.byName(mention.textContent);
          const url = profile ? YM.people.avatarUrl(profile) : null;
          if (url) {
            if (mention.getAttribute('data-ym-av') !== url) {
              mention.setAttribute('data-ym-av', url);
              mention.style.setProperty('--ym-av', 'url("' + url.replace(/"/g, '%22') + '")');
            }
          } else if (mention.hasAttribute('data-ym-av')) {
            mention.removeAttribute('data-ym-av');
            mention.style.removeProperty('--ym-av');
          }
        });
      };
      ctx.cleanup(YM.messages.decorate(syncMessage));
      ctx.on('store:change', (s, p) => {
        if (s.profiles !== p.profiles) YM.messages.forEachVisible(syncMessage);
      });
      ctx.cleanup(() => document.querySelectorAll('[data-ym-av]').forEach((el) => { el.removeAttribute('data-ym-av'); el.style.removeProperty('--ym-av'); }));
      ctx.css('.mention[data-ym-av]::before{content:"";display:inline-block;width:1.15em;height:1.15em;margin:0 4px 0 1px;vertical-align:-.2em;border-radius:50%;background:var(--ym-av) center/cover no-repeat,var(--bg-elev)}');
    },
  });
})();
