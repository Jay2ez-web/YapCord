// RoleColorEverywhere (port): the colour of someone's top role also on @mentions, in reply previews, the typing line and the voice channel lists.
(function () {
  const TARGETS = [
    ['.msg-text .mention:not(.role):not(.chan),.reply-text .mention:not(.role):not(.chan)', (el) => el.textContent],
    ['.voice-person .name', (el) => el.textContent],
    ['.typing-line b', (el) => el.textContent],
  ];

  YM.definePlugin({
    name: 'RoleColorEverywhere',
    description: 'Gives the colour of the top role to @mentions, the typing line and the voice channel lists (Yapper already colours names in messages).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Appearance', 'Servers'],
    options: {
      mentions: { type: 'boolean', default: true, description: 'Colour @mentions' },
      typing: { type: 'boolean', default: true, description: 'Colour names in the typing line' },
      voice: { type: 'boolean', default: true, description: 'Colour names under voice channels' },
    },
    start(ctx) {
      const set = (el, color) => {
        if (color) {
          if (el.getAttribute('data-ym-rc') !== color) {
            el.setAttribute('data-ym-rc', color);
            el.style.setProperty('--ym-rc', color);
          }
        } else if (el.hasAttribute('data-ym-rc')) {
          el.removeAttribute('data-ym-rc');
          el.style.removeProperty('--ym-rc');
        }
      };
      const sync = () => {
        const serverId = YM.people.currentServerId();
        const o = ctx.settings.store;
        TARGETS.forEach(([selector, nameOf], i) => {
          const on = i === 0 ? o.mentions : i === 1 ? o.voice : o.typing;
          document.querySelectorAll(selector).forEach((el) => {
            const profile = on && serverId ? YM.people.byName(nameOf(el)) : null;
            set(el, profile ? YM.people.nameColor(profile.id, serverId) : null);
          });
        });
      };
      ctx.onMutate(sync);
      ctx.cleanup(ctx.settings.onChange(() => sync()));
      ctx.on('store:change', (s, p) => { if (s.memberRoles !== p.memberRoles || s.roles !== p.roles || s.profiles !== p.profiles) sync(); });
      sync();
      ctx.cleanup(() => document.querySelectorAll('[data-ym-rc]').forEach((el) => { el.removeAttribute('data-ym-rc'); el.style.removeProperty('--ym-rc'); }));
      ctx.css('[data-ym-rc]{color:var(--ym-rc)!important}.mention[data-ym-rc]{background:color-mix(in srgb,var(--ym-rc) 18%,transparent)!important}');
    },
  });
})();
