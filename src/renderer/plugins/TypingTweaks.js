// TypingTweaks (port): small avatars in the typing line ("Sam is typing...").
(function () {
  YM.definePlugin({
    name: 'TypingTweaks',
    description: 'Shows the avatars of the people who are typing in the typing line under the message box (role colours: see RoleColorEverywhere).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Appearance'],
    start(ctx) {
      const sync = () => {
        document.querySelectorAll('.typing-line.on b').forEach((el) => {
          const profile = YM.people.byName(el.textContent);
          const url = profile ? YM.people.avatarUrl(profile) : null;
          if (url) {
            if (el.getAttribute('data-ym-tav') !== url) {
              el.setAttribute('data-ym-tav', url);
              el.style.setProperty('--ym-tav', 'url("' + url.replace(/"/g, '%22') + '")');
            }
          } else if (el.hasAttribute('data-ym-tav')) {
            el.removeAttribute('data-ym-tav');
            el.style.removeProperty('--ym-tav');
          }
        });
      };
      ctx.onMutate(sync);
      sync();
      ctx.cleanup(() => document.querySelectorAll('[data-ym-tav]').forEach((el) => { el.removeAttribute('data-ym-tav'); el.style.removeProperty('--ym-tav'); }));
      ctx.css('.typing-line b[data-ym-tav]::before{content:"";display:inline-block;width:16px;height:16px;margin-right:4px;vertical-align:-3px;border-radius:50%;background:var(--ym-tav) center/cover no-repeat,var(--bg-elev)}');
    },
  });
})();
