// ShowHiddenChannels: a local directory of channel metadata already loaded by the app.
// It makes no network requests, never reads messages, and does not navigate into channels.
(function () {
  const byPosition = (a, b) => {
    const ap = Number.isFinite(Number(a.position)) ? Number(a.position) : 0;
    const bp = Number.isFinite(Number(b.position)) ? Number(b.position) : 0;
    return ap - bp || String(a.name || '').localeCompare(String(b.name || ''));
  };

  function collect(state, serverId) {
    if (!state || !serverId || !state.servers || !state.servers[serverId]) return null;
    const channels = Object.values(state.channels || {}).filter((channel) =>
      channel && channel.server_id === serverId && typeof channel.name === 'string' && channel.id,
    ).sort(byPosition);
    const categories = Object.values(state.categories || {}).filter((category) =>
      category && category.server_id === serverId && typeof category.name === 'string' && category.id,
    ).sort(byPosition);
    const groups = new Map(categories.map((category) => [category.id, { category, channels: [] }]));
    const uncategorized = { category: null, channels: [] };

    for (const channel of channels) {
      const categoryId = channel.category_id || channel.categoryId || null;
      const group = categoryId && groups.get(categoryId);
      if (group) group.channels.push(channel);
      else uncategorized.channels.push(channel);
    }

    return {
      server: state.servers[serverId],
      categories,
      groups: [...groups.values()].filter((group) => group.channels.length),
      uncategorized: uncategorized.channels.length ? uncategorized : null,
      channelCount: channels.length,
    };
  }

  function makeRow(h, channel) {
    const kind = channel.kind === 'voice' || channel.type === 'voice' ? 'Voice' : 'Text';
    const details = [];
    if (channel.private === true) details.push('Private');
    if (channel.read_only === true) details.push('Read-only');
    if (Number(channel.slowmode) > 0) details.push('Slow mode: ' + Number(channel.slowmode) + 's');
    return h('div', { class: 'ym-shc-row' },
      h('span', { class: 'ym-shc-type', 'aria-label': kind + ' channel' }, kind),
      h('span', { class: 'ym-shc-name' }, channel.name),
      details.length ? h('span', { class: 'ym-shc-details' }, details.join(' · ')) : null,
    );
  }

  function renderResults(h, container, data, query) {
    container.replaceChildren();
    if (!data || !data.channelCount) {
      container.append(h('div', { class: 'ym-shc-empty' }, 'No channel metadata for this server is loaded in the app state.'));
      return;
    }
    const q = String(query || '').trim().toLowerCase();
    let shown = 0;
    const addGroup = (title, channels) => {
      const matches = channels.filter((channel) => !q || channel.name.toLowerCase().includes(q) || title.toLowerCase().includes(q));
      if (!matches.length) return;
      shown += matches.length;
      container.append(
        h('section', { class: 'ym-shc-group' },
          h('div', { class: 'ym-shc-heading' }, title),
          matches.map((channel) => makeRow(h, channel)),
        ),
      );
    };
    for (const group of data.groups) addGroup(group.category.name, group.channels);
    if (data.uncategorized) addGroup('Uncategorized', data.uncategorized.channels);
    if (!shown) container.append(h('div', { class: 'ym-shc-empty' }, 'No loaded channel names match your search.'));
  }

  function open(serverId) {
    const h = YM.dom.h;
    const data = collect(YM.Store.getState(), serverId);
    if (!data) { YM.toast('This server or its channel data is not loaded.', { type: 'error' }); return null; }

    const search = h('input', {
      class: 'ym-input ym-shc-search',
      type: 'search',
      placeholder: 'Filter loaded channel names…',
      'aria-label': 'Filter loaded channel names',
      spellcheck: 'false',
    });
    const results = h('div', { class: 'ym-shc-results' });
    renderResults(h, results, data, '');
    search.addEventListener('input', () => renderResults(h, results, data, search.value));

    return YM.modal.open({
      title: 'Channel directory',
      subtitle: data.server.name + ' · ' + data.channelCount + ' loaded channels',
      wide: true,
      body: [
        h('div', { class: 'ym-shc-note' }, 'Names and categories come only from channel records already loaded in this app. This view does not request server data, load messages, or open channels.'),
        search,
        results,
      ],
    });
  }

  YM.definePlugin({
    name: 'ShowHiddenChannels',
    description: 'Browse channel names and categories already loaded in the app state, including entries not currently visible in the sidebar. Metadata only; no API requests or message access.',
    authors: ['YapCord'],
    tags: ['Servers', 'Utility', 'Privacy'],
    enabledByDefault: false,
    api: { collect, open },
    start(ctx) {
      const sync = () => {
        document.querySelectorAll('.server-menu').forEach((menu) => {
          if (menu.querySelector('.ym-shc-item')) return;
          const state = YM.Store.getState();
          const serverId = state && state.activeServerId;
          if (!serverId || !state.servers || !state.servers[serverId]) return;
          menu.append(YM.dom.h('button', {
            type: 'button',
            role: 'menuitem',
            class: 'ym-shc-item',
            onClick: () => {
              const overlay = menu.closest('.overlay');
              if (overlay) overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
              open(serverId);
            },
          }, YM.dom.h('span', {}, 'Channel directory (loaded metadata)')));
        });
      };
      ctx.onMutate(sync);
      sync();
      ctx.cleanup(() => document.querySelectorAll('.ym-shc-item').forEach((node) => node.remove()));
      ctx.css(`
.ym-shc-note{font-size:12px;color:var(--text-faint,#92939b);line-height:1.5;margin-bottom:10px}
.ym-shc-search{width:100%;margin-bottom:10px}
.ym-shc-results{max-height:55vh;overflow:auto;display:flex;flex-direction:column;gap:10px}
.ym-shc-group{border:1px solid var(--border,#343640);border-radius:8px;padding:8px 10px}
.ym-shc-heading{font-size:12px;font-weight:700;color:var(--text-faint,#92939b);margin-bottom:5px}
.ym-shc-row{display:flex;align-items:center;gap:8px;min-height:30px;border-top:1px solid var(--border,#2d2f37);font-size:13px}
.ym-shc-type{font-size:10px;color:var(--text-faint,#92939b);text-transform:uppercase;min-width:34px}
.ym-shc-name{overflow-wrap:anywhere}
.ym-shc-details{margin-left:auto;font-size:10px;color:var(--text-faint,#92939b);text-align:right}
.ym-shc-empty{font-size:13px;color:var(--text-faint,#92939b);padding:10px}
`);
    },
  });
})();
