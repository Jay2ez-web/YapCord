// ShowHiddenChannels: display only channel metadata already present in Yapper's local application state.
// No fetches, API calls, channel navigation, message-history requests, or access-control bypasses.
(() => {
  const byPosition = (a, b) => {
    const ap = Number.isFinite(Number(a.position)) ? Number(a.position) : 0;
    const bp = Number.isFinite(Number(b.position)) ? Number(b.position) : 0;
    return ap - bp || String(a.name || '').localeCompare(String(b.name || ''));
  };

  const serverOf = (record) => record && (record.server_id || record.guild_id || record.serverId || record.guildId);
  const idOf = (record) => record && (record.id || record.channel_id || record.channelId);
  const categoryOf = (channel) => channel && (channel.category_id || channel.categoryId || channel.parent_id || channel.parentId);

  function hasExplicitHiddenFlag(channel) {
    if (!channel || typeof channel !== 'object') return false;
    if (channel.hidden === true || channel.is_hidden === true || channel.isHidden === true || channel.visibility === 'hidden') return true;
    if (channel.can_view === false || channel.canView === false || channel.viewable === false) return true;
    const perms = channel.permissions || channel.perms || channel.permission;
    return !!(perms && typeof perms === 'object' && (perms.view_channel === false || perms.VIEW_CHANNEL === false));
  }

  function recordsForServer(source, serverId) {
    const result = [];
    const seen = new Set();
    const add = (record) => {
      if (!record || typeof record !== 'object' || !serverId || String(serverOf(record) || '') !== String(serverId)) return;
      const id = idOf(record);
      if (!id || typeof record.name !== 'string' || seen.has(String(id))) return;
      seen.add(String(id));
      result.push(record);
    };
    const visit = (value) => {
      if (Array.isArray(value)) {
        for (const item of value) add(item);
      } else if (value && typeof value === 'object') {
        add(value);
        for (const item of Object.values(value)) {
          if (Array.isArray(item)) for (const nested of item) add(nested);
          else add(item);
        }
      }
    };
    visit(source);
    if (source && !Array.isArray(source) && typeof source === 'object') visit(source[serverId]);
    return result.sort(byPosition);
  }

  function collect(state, serverId) {
    if (!state || !serverId) return null;
    const server = (state.servers && state.servers[serverId]) || (state.guilds && state.guilds[serverId]) || { id: serverId, name: 'Server' };
    const channels = recordsForServer(state.channels || state.guildChannels, serverId);
    const categories = recordsForServer(state.categories || state.channelCategories, serverId);
    const categoryMap = new Map(categories.map((category) => [String(idOf(category)), category]));
    const groups = new Map(categories.map((category) => [String(idOf(category)), { category, channels: [] }]));
    const uncategorized = { category: null, channels: [] };

    for (const channel of channels) {
      const categoryId = categoryOf(channel);
      const group = categoryId != null && groups.get(String(categoryId));
      if (group) group.channels.push(channel);
      else uncategorized.channels.push(channel);
    }

    const hiddenCount = channels.filter((channel) => {
      const category = categoryMap.get(String(categoryOf(channel)));
      return hasExplicitHiddenFlag(channel) || hasExplicitHiddenFlag(category);
    }).length;

    return {
      server,
      categories,
      groups: [...groups.values()].filter((group) => group.channels.length),
      uncategorized: uncategorized.channels.length ? uncategorized : null,
      channelCount: channels.length,
      hiddenCount,
    };
  }

  function isExplicitlyHidden(channel, categoriesById) {
    const category = categoriesById.get(String(categoryOf(channel)));
    return hasExplicitHiddenFlag(channel) || hasExplicitHiddenFlag(category);
  }

  function channelKind(channel) {
    const kind = String(channel.kind || channel.type || '').toLowerCase();
    if (kind === 'voice' || kind === 'stage' || kind === '2' || kind === '13') return 'Voice';
    if (kind === 'forum' || kind === '15') return 'Forum';
    if (kind === 'announcement' || kind === '5') return 'Announcement';
    return 'Text';
  }

  function makeRow(h, channel, hidden) {
    const details = [];
    if (hidden) details.push('Hidden flag');
    if (channel.private === true) details.push('Private');
    if (channel.read_only === true || channel.readOnly === true) details.push('Read-only');
    const slowmode = Number(channel.slowmode ?? channel.rate_limit_per_user);
    if (Number.isFinite(slowmode) && slowmode > 0) details.push('Slow mode: ' + slowmode + 's');
    const topic = typeof channel.topic === 'string' ? channel.topic.trim() : '';
    return h('div', { class: 'ym-shc-row' + (hidden ? ' is-hidden' : '') },
      h('span', { class: 'ym-shc-type', 'aria-label': channelKind(channel) + ' channel' }, channelKind(channel)),
      h('span', { class: 'ym-shc-name' }, channel.name),
      topic ? h('span', { class: 'ym-shc-topic', title: topic }, topic) : null,
      details.length ? h('span', { class: 'ym-shc-details' }, details.join(' · ')) : null,
    );
  }

  function renderResults(h, container, data, query, mode) {
    container.replaceChildren();
    if (!data || !data.channelCount) {
      container.append(h('div', { class: 'ym-shc-empty' }, 'No channel metadata for this server is currently in Yapper’s local state. Open the server normally, then use Refresh.'));
      return;
    }
    const q = String(query || '').trim().toLowerCase();
    const categoriesById = new Map(data.categories.map((category) => [String(idOf(category)), category]));
    let shown = 0;
    const addGroup = (title, channels) => {
      const matches = channels.filter((channel) => {
        const hidden = isExplicitlyHidden(channel, categoriesById);
        if (mode === 'hidden' && !hidden) return false;
        return !q || channel.name.toLowerCase().includes(q) || title.toLowerCase().includes(q) || String(channel.topic || '').toLowerCase().includes(q);
      });
      if (!matches.length) return;
      shown += matches.length;
      container.append(h('section', { class: 'ym-shc-group' },
        h('div', { class: 'ym-shc-heading' }, title),
        matches.map((channel) => makeRow(h, channel, isExplicitlyHidden(channel, categoriesById))),
      ));
    };
    for (const group of data.groups) addGroup(group.category.name, group.channels);
    if (data.uncategorized) addGroup('Uncategorized', data.uncategorized.channels);
    if (!shown) {
      const message = mode === 'hidden' && data.hiddenCount === 0
        ? 'Yapper has not supplied explicit hidden/view-permission flags for the cached channel records. The plugin will not guess or request protected data.'
        : 'No cached channel names match your filter.';
      container.append(h('div', { class: 'ym-shc-empty' }, message));
    }
  }

  function open(serverId) {
    const h = YM.dom.h;
    if (!serverId) { YM.toast('Open a server first.', { type: 'error' }); return null; }
    let data = collect(YM.Store.getState(), serverId);
    if (!data) { YM.toast('This server is not available in the local app state.', { type: 'error' }); return null; }

    const search = h('input', {
      class: 'ym-input ym-shc-search', type: 'search', placeholder: 'Filter cached channel names…',
      'aria-label': 'Filter cached channel names', spellcheck: 'false',
    });
    const mode = h('select', { class: 'ym-input ym-shc-mode', 'aria-label': 'Channel filter' },
      h('option', { value: 'all', selected: true }, 'All cached channels'),
      h('option', { value: 'hidden' }, 'Explicitly marked hidden only'));
    const results = h('div', { class: 'ym-shc-results' });
    const refresh = h('button', {
      class: 'ym-btn ym-btn-small ym-shc-refresh', type: 'button',
      onClick: () => {
        data = collect(YM.Store.getState(), serverId);
        renderResults(h, results, data, search.value, mode.value);
      },
    }, 'Refresh from local state');
    const render = () => renderResults(h, results, data, search.value, mode.value);
    search.addEventListener('input', render);
    mode.addEventListener('change', render);
    render();

    return YM.modal.open({
      title: 'Channel directory',
      subtitle: data.server.name + ' · ' + data.channelCount + ' cached channels · ' + data.hiddenCount + ' explicit hidden flags',
      wide: true,
      body: [
        h('div', { class: 'ym-shc-note' }, 'Vencord-style metadata view: only channel records already present in Yapper’s local state. It does not fetch channels, open them, or load messages. A channel absent from local state cannot be revealed by this view.'),
        h('div', { class: 'ym-shc-toolbar' }, search, mode, refresh),
        results,
      ],
    });
  }

  const h = YM.dom.h;
  YM.definePlugin({
    name: 'ShowHiddenChannels',
    description: 'Browse cached channel metadata, including channels marked hidden by Yapper’s local state. No network calls, channel navigation, or message access.',
    authors: ['YapCord'],
    tags: ['Servers', 'Utility', 'Privacy'],
    enabledByDefault: false,
    options: {
      openDirectory: {
        type: 'custom',
        default: null,
        description: 'Open the cached channel directory',
        render(container) {
          container.append(
            h('button', { class: 'ym-btn ym-btn-small', type: 'button', onClick: () => {
              const state = YM.Store.getState();
              open(state && state.activeServerId);
            } }, 'Open channel directory for current server'),
            h('div', { class: 'ym-hint' }, 'This reads only metadata already loaded in the app. Enable the plugin, open its options, then refresh after entering a server.'),
          );
        },
      },
    },
    api: { collect, hasExplicitHiddenFlag, open },
    start(ctx) {
      const sync = () => {
        document.querySelectorAll('.server-menu').forEach((menu) => {
          if (menu.querySelector('.ym-shc-item')) return;
          const state = YM.Store.getState();
          const serverId = state && state.activeServerId;
          if (!serverId) return;
          menu.append(YM.dom.h('button', {
            type: 'button', role: 'menuitem', class: 'ym-shc-item',
            onClick: () => {
              const overlay = menu.closest('.overlay');
              if (overlay) overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
              open(serverId);
            },
          }, YM.dom.h('span', {}, 'Channel directory (cached metadata)')));
        });
      };
      ctx.onMutate(sync);
      sync();
      ctx.cleanup(() => document.querySelectorAll('.ym-shc-item').forEach((node) => node.remove()));
      ctx.css(`
.ym-shc-note{font-size:12px;color:var(--text-faint,#92939b);line-height:1.5;margin-bottom:10px}
.ym-shc-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.ym-shc-search{flex:1;min-width:180px}
.ym-shc-mode{width:auto;min-width:170px}
.ym-shc-results{max-height:55vh;overflow:auto;display:flex;flex-direction:column;gap:10px}
.ym-shc-group{border:1px solid var(--border,#343640);border-radius:8px;padding:8px 10px}
.ym-shc-heading{font-size:12px;font-weight:700;color:var(--text-faint,#92939b);margin-bottom:5px}
.ym-shc-row{display:flex;align-items:center;gap:8px;min-height:30px;border-top:1px solid var(--border,#2d2f37);font-size:13px}
.ym-shc-row.is-hidden .ym-shc-name{font-weight:700}
.ym-shc-type{font-size:10px;color:var(--text-faint,#92939b);text-transform:uppercase;min-width:60px}
.ym-shc-name{overflow-wrap:anywhere}
.ym-shc-topic{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:36%;font-size:11px;color:var(--text-faint,#92939b)}
.ym-shc-details{margin-left:auto;font-size:10px;color:var(--text-faint,#92939b);text-align:right}
.ym-shc-empty{font-size:13px;color:var(--text-faint,#92939b);padding:10px}
      `);
    },
  });
})();
