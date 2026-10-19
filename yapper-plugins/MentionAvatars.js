// MentionAvatars (port): a small picture of the person in front of an @mention.
(function () {
  YM.definePlugin({
    name: 'MentionAvatars',
    description: 'Shows the avatar of the person inside @mentions in messages.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Appearance'],
    start(ctx) {
      // Only a data attribute and a CSS variable are set: Yapper's own rendering of the mention is left alone.
      const sync = () => {
        document.querySelectorAll('.msg-text .mention:not(.role):not(.chan),.reply-text .mention:not(.role):not(.chan)').forEach((el) => {
          const profile = YM.people.byName(el.textContent);
          const url = profile ? YM.people.avatarUrl(profile) : null;
          if (url) {
            if (el.getAttribute('data-ym-av') !== url) {
              el.setAttribute('data-ym-av', url);
              el.style.setProperty('--ym-av', 'url("' + url.replace(/"/g, '%22') + '")');
            }
          } else if (el.hasAttribute('data-ym-av')) {
            el.removeAttribute('data-ym-av');
            el.style.removeProperty('--ym-av');
          }
        });
      };
      ctx.onMutate(sync);
      ctx.on('store:change', (s, p) => { if (s.profiles !== p.profiles) sync(); });
      sync();
      ctx.cleanup(() => document.querySelectorAll('[data-ym-av]').forEach((el) => { el.removeAttribute('data-ym-av'); el.style.removeProperty('--ym-av'); }));
      ctx.css('.mention[data-ym-av]::before{content:"";display:inline-block;width:1.15em;height:1.15em;margin:0 4px 0 1px;vertical-align:-.2em;border-radius:50%;background:var(--ym-av) center/cover no-repeat,var(--bg-elev)}');
    },
  });
})();
