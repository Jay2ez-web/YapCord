// IrcColors (port): every user gets their own name color, like in IRC clients (the same user always gets the same color).
(function () {
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function colorFor(id, { saturation = 70, lightness = 68 } = {}) {
    return 'hsl(' + (hash(String(id)) % 360) + ' ' + saturation + '% ' + lightness + '%)';
  }

  YM.definePlugin({
    name: 'IrcColors',
    description: 'Gives every user a unique name color (like IRC clients). The same person always gets the same color.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Appearance'],
    api: { colorFor },
    options: {
      saturation: { type: 'slider', default: 70, min: 20, max: 100, step: 5, description: 'Color strength (%)' },
      lightness: { type: 'slider', default: 68, min: 40, max: 85, step: 1, description: 'Brightness (%)' },
      keepRoleColors: { type: 'boolean', default: true, description: 'Leave names that already have a role color alone' },
    },
    start(ctx) {
      ctx.cleanup(YM.messages.decorate(({ el, message }) => {
        const name = el.querySelector(':scope .msg-head .msg-author:not(.webhook-author)');
        if (!name || !message) return;
        const s = ctx.settings.store;
        const own = name.dataset.ymIrc === '1';
        if (!own && s.keepRoleColors && name.style.color) return;
        name.style.color = colorFor(message.author_id, s);
        name.dataset.ymIrc = '1';
      }));
      ctx.cleanup(() => document.querySelectorAll('[data-ym-irc]').forEach((n) => { n.style.color = ''; delete n.dataset.ymIrc; }));
    },
  });
})();
