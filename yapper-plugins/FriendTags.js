// FriendTags: local-only tags for friends; tag text is searchable in the existing quick switcher.
// Tags stay in YapCord settings. This plugin makes no network requests and does not trigger account actions.
(function () {
  const KEY = 'pluginData.FriendTags';
  const MAX_TAGS = 8;
  const MAX_TAG_LENGTH = 24;

  function cleanTag(value) {
    return String(value == null ? '' : value).trim().toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, MAX_TAG_LENGTH);
  }

  function parseTags(value) {
    const source = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[\n,]+/);
    return [...new Set(source.map(cleanTag).filter(Boolean))].slice(0, MAX_TAGS);
  }

  function readTags() {
    const raw = YM.settings.get(KEY, {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [id, value] of Object.entries(raw)) {
      const tags = parseTags(value);
      if (tags.length) out[id] = tags;
    }
    return out;
  }

  function isFriend(state, userId) {
    return !!(state && userId && userId !== state.userId && state.friends && state.friends[userId] === 'accepted' && state.profiles && state.profiles[userId]);
  }

  function getTags(userId) {
    return readTags()[userId] || [];
  }

  function setTags(userId, value) {
    const state = YM.Store.getState();
    if (!isFriend(state, userId)) return false;
    const all = readTags();
    const tags = parseTags(value);
    if (tags.length) all[userId] = tags;
    else delete all[userId];
    YM.settings.set(KEY, all);
    return tags;
  }

  function displayName(profile) {
    return profile && (profile.display_name || profile.username) || 'Unknown';
  }

  function buttonUserId(button, state) {
    const nodes = [button, button.closest && button.closest('[data-user-id], [data-user], [data-member-id]'), button.querySelector && button.querySelector('[data-user-id], [data-user], [data-member-id]')].filter(Boolean);
    for (const node of nodes) {
      const d = node.dataset || {};
      for (const id of [d.userId, d.user, d.memberId, d.id]) if (isFriend(state, id)) return id;
    }
    const clone = button.cloneNode(true);
    clone.querySelectorAll('.ym-ft-tags').forEach((node) => node.remove());
    const labels = [button.getAttribute('aria-label'), clone.innerText, clone.textContent]
      .filter(Boolean).flatMap((text) => String(text).split(/[\n\r]+/)).map((text) => text.trim()).filter(Boolean);
    for (const label of labels) {
      const profile = YM.people.byName(label);
      if (profile && isFriend(state, profile.id)) return profile.id;
    }
    return null;
  }

  function syncMemberLabels() {
    const state = YM.Store.getState();
    if (!state) return;
    const all = readTags();
    document.querySelectorAll('.members-panel button, .people-row button').forEach((button) => {
      const userId = buttonUserId(button, state);
      const tags = userId ? all[userId] || [] : [];
      let label = button.querySelector(':scope > .ym-ft-tags');
      if (!tags.length) { if (label) label.remove(); return; }
      const text = tags.map((tag) => '&' + tag).join(' ');
      if (!label) {
        label = document.createElement('span');
        label.className = 'ym-ft-tags';
        label.setAttribute('aria-label', 'Your local friend tags');
        button.append(label);
      }
      if (label.textContent !== text) label.textContent = text;
    });
  }

  function openEditor(userId) {
    const state = YM.Store.getState();
    if (!isFriend(state, userId)) { YM.toast('Tags are available for friends loaded in your account.', { type: 'error' }); return null; }
    const h = YM.dom.h;
    const profile = state.profiles[userId];
    const input = h('input', { type: 'text', class: 'input', maxlength: MAX_TAGS * (MAX_TAG_LENGTH + 1), value: getTags(userId).join(', '), placeholder: 'close-friends, gaming, school', 'aria-label': 'Local tags for ' + displayName(profile), style: { width: '100%' } });
    const save = (close) => {
      const tags = setTags(userId, input.value);
      if (tags === false) { YM.toast('Could not save tags for that friend.', { type: 'error' }); return; }
      YM.toast(tags.length ? 'Friend tags saved on this device.' : 'Friend tags removed.');
      syncMemberLabels();
      close();
    };
    return YM.modal.open({
      title: 'Friend tags',
      subtitle: displayName(profile) + (profile.username ? '  (@' + profile.username + ')' : ''),
      body: h('div', {},
        h('div', { class: 'ym-ft-note' }, 'Comma-separated tags are stored locally and visible only in your YapCord client. In the existing quick switcher, search for a tag starting with & (for example, &gaming).'),
        input,
        h('div', { class: 'ym-ft-note' }, 'Tags use letters, numbers, hyphens, or underscores; spaces become hyphens. Up to ' + MAX_TAGS + ' tags per friend.'),
      ),
      buttons: [
        { label: 'Save tags', onClick: save },
        getTags(userId).length ? { label: 'Remove tags', danger: true, onClick: (close) => saveWithEmpty(close) } : null,
      ].filter(Boolean),
    });
    function saveWithEmpty(close) {
      const tags = setTags(userId, '');
      if (tags !== false) { YM.toast('Friend tags removed.'); syncMemberLabels(); close(); }
    }
  }

  function renderManager(box) {
    const h = YM.dom.h;
    box.style.flexDirection = 'column';
    box.style.alignItems = 'stretch';
    const list = h('div', { class: 'ym-ft-list' });
    let query = '';
    const search = h('input', { type: 'search', class: 'input', placeholder: 'Search friends…', 'aria-label': 'Search friends for tags', style: { width: '100%' }, onInput: (event) => { query = event.target.value; draw(); } });

    function friends() {
      const state = YM.Store.getState();
      if (!state) return [];
      const tags = readTags();
      const q = query.trim().toLowerCase().replace(/^@/, '');
      const ids = new Set(Object.entries(state.friends || {}).filter(([, status]) => status === 'accepted').map(([id]) => id));
      Object.keys(tags).forEach((id) => ids.add(id));
      return [...ids].filter((id) => isFriend(state, id)).map((id) => state.profiles[id])
        .filter((profile) => !q || displayName(profile).toLowerCase().includes(q) || String(profile.username || '').toLowerCase().includes(q))
        .sort((a, b) => displayName(a).localeCompare(displayName(b))).slice(0, 100);
    }

    function draw() {
      const active = document.activeElement === search;
      list.replaceChildren();
      const state = YM.Store.getState();
      const items = friends();
      if (!YM.Store.isReady || !state) list.append(h('div', { class: 'hint' }, 'Friends appear once you are logged in and the account data is loaded.'));
      else if (!items.length) list.append(h('div', { class: 'hint' }, query ? 'No matching friends found.' : 'No friends are loaded yet.'));
      for (const profile of items) {
        const input = h('input', { type: 'text', class: 'input', value: getTags(profile.id).join(', '), placeholder: 'tag-one, tag-two', 'aria-label': 'Tags for ' + displayName(profile) });
        let saved = false;
        const commit = () => {
          if (saved) return;
          saved = true;
          setTags(profile.id, input.value);
          draw();
          syncMemberLabels();
        };
        input.addEventListener('change', commit);
        input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); } });
        list.append(h('div', { class: 'ym-ft-row' },
          h('span', { class: 'ym-ft-person' }, displayName(profile), profile.username ? h('span', { class: 'hint' }, ' @' + profile.username) : null),
          input,
        ));
      }
      if (active) search.focus();
    }

    box.append(
      h('div', { class: 'hint' }, 'Friend tags are stored only in your YapCord settings. Tag text is added to currently rendered friend/member rows so the existing quick switcher can find them with an &tag search.'),
      search,
      list,
    );
    draw();
  }

  YM.definePlugin({
    name: 'FriendTags',
    description: 'Store private local tags for friends and search tagged, currently rendered rows in the existing quick switcher with &tag.',
    authors: ['YapCord'],
    tags: ['Friends', 'Utility'],
    enabledByDefault: false,
    api: { cleanTag, parseTags, readTags, getTags, setTags, syncMemberLabels },
    options: { manage: { type: 'custom', default: false, render: (box) => renderManager(box) } },
    start(ctx) {
      ctx.css(`
.ym-ft-tags{display:inline-flex;margin-left:6px;gap:3px;font-size:10px;line-height:1.4;color:var(--text-faint,#92939b);white-space:nowrap;pointer-events:none}
.ym-ft-note{font-size:12px;color:var(--text-faint,#92939b);line-height:1.5;margin:0 0 8px}
.ym-ft-list{display:flex;flex-direction:column;gap:6px;margin:8px 0;max-height:340px;overflow:auto;width:100%}
.ym-ft-row{display:flex;align-items:center;gap:10px;min-height:34px}
.ym-ft-person{flex:1;min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ym-ft-row input.input{width:220px;max-width:48%}
`);
      const sync = () => {
        syncMemberLabels();
        const state = YM.Store.getState();
        if (!state) return;
        document.querySelectorAll('.profile-card .pc2-head').forEach((head) => {
          const userId = state.profileCard;
          const existing = head.querySelector('.ym-ft-profile-button');
          if (!isFriend(state, userId)) { if (existing) existing.remove(); return; }
          if (existing && existing.getAttribute('data-user') === userId) return;
          if (existing) existing.remove();
          head.append(YM.dom.h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-ft-profile-button', 'data-user': userId, onClick: () => openEditor(userId) }, getTags(userId).length ? 'Edit friend tags' : 'Friend tags'));
        });
      };
      ctx.onMutate(sync);
      ctx.on('store:change', (state, prev) => {
        if (state.friends !== prev.friends || state.profiles !== prev.profiles || state.profileCard !== prev.profileCard) sync();
      });
      ctx.cleanup(YM.settings.onPath(KEY, sync));
      sync();
      ctx.cleanup(() => document.querySelectorAll('.ym-ft-tags,.ym-ft-profile-button').forEach((node) => node.remove()));
    },
  });
})();
