// ServerListIndicators (port): how many friends are online and how many servers you are in, right under the logo in the server list.
(function () {
  function counts() {
    const s = YM.Store.getState();
    if (!s) return { friends: 0, servers: 0 };
    let friends = 0;
    for (const [id, status] of Object.entries(s.friends || {})) {
      const presence = s.online && s.online[id];
      if (status === 'accepted' && presence && presence !== 'offline' && presence !== 'invisible') friends++;
    }
    return { friends, servers: Object.keys(s.servers || {}).length };
  }

  YM.definePlugin({
    name: 'ServerListIndicators',
    description: 'Shows the number of friends that are online and the number of servers you are in under the logo in the server list.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Servers', 'Appearance'],
    api: { counts },
    options: {
      mode: {
        type: 'select', default: 'both', description: 'What to show',
        options: [{ label: 'Friends and servers', value: 'both' }, { label: 'Online friends', value: 'friends' }, { label: 'Server count', value: 'servers' }],
      },
    },
    start(ctx) {
      const h = YM.dom.h;
      let box = null;
      const build = () => { box = h('div', { class: 'ym-sli', 'aria-label': 'Online friends and server count' }); };
      function update() {
        const rail = document.querySelector('nav.rail');
        if (!rail) return;
        if (!box) build();
        const home = rail.querySelector(':scope > .rail-wrap button.rail-item[title="Direct messages"]');
        const homeWrap = home ? home.closest('.rail-wrap') : null;
        const anchor = rail.querySelector(':scope > .ym-ra-wrap') || homeWrap;
        if (anchor) {
          if (box.previousElementSibling !== anchor || box.parentNode !== rail) anchor.after(box);
        } else if (box.parentNode !== rail) rail.prepend(box);
        const c = counts();
        const mode = ctx.settings.store.mode;
        const parts = [];
        if (mode !== 'servers') parts.push(h('div', { class: 'ym-sli-row', title: c.friends + ' friends online' }, h('i', { class: 'ym-sli-dot' }), String(c.friends)));
        if (mode !== 'friends') parts.push(h('div', { class: 'ym-sli-row', title: c.servers + ' servers' }, String(c.servers), h('span', { class: 'ym-sli-unit' }, ' srv')));
        const key = mode + ':' + c.friends + ':' + c.servers;
        if (box.getAttribute('data-key') !== key) {
          box.setAttribute('data-key', key);
          box.replaceChildren(...parts);
        }
      }
      update();
      ctx.onMutate(update);
      ctx.cleanup(ctx.settings.onChange(() => update()));
      ctx.on('store:change', (s, p) => { if (s.friends !== p.friends || s.online !== p.online || s.servers !== p.servers) update(); });
      ctx.cleanup(() => { if (box) box.remove(); box = null; });
      ctx.css(`
.ym-sli{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;font-weight:700;color:var(--text-muted);line-height:1.2;user-select:none}
.ym-sli-row{display:flex;align-items:center;gap:4px}
.ym-sli-dot{width:8px;height:8px;border-radius:50%;background:var(--success,#3ba55d);display:inline-block}
.ym-sli-unit{font-weight:500;opacity:.8}
`);
    },
  });
})();
