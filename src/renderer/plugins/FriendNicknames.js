// FriendNicknames: give a friend (or anyone) a name of your own, like a nickname on Roblox. Only you see it.
// Yapper itself is never told: the name is swapped in your own copy of Yapper's data, so it shows up everywhere Yapper
// shows that person's name: the friends list, your chats, messages, voice, calls and the profile card.
// The nicknames are kept in your YapCord settings and are part of "Backup".
(function () {
  const KEY = 'pluginData.FriendNicknames';
  const MAX = 32;

  const read = () => {
    const v = YM.settings.get(KEY, {});
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  };
  const clean = (text) => String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, MAX);

  // userId -> what Yapper said the name was before we replaced it, and what we wrote instead
  const original = new Map();
  const applied = new Map();

  function setNickname(userId, text) {
    const name = clean(text);
    const map = { ...read() };
    if (name) map[userId] = name;
    else delete map[userId];
    YM.settings.set(KEY, map);
    return name;
  }

  /** Yapper's own name for the person (not the nickname). */
  function realName(userId) {
    const p = YM.Store.profile(userId);
    if (!p) return '';
    const real = applied.has(userId) && applied.get(userId) === p.display_name ? original.get(userId) : p.display_name;
    return real || p.username || '';
  }

  function nicknameOf(userId) {
    return read()[userId] || '';
  }

  /** Make the store match the nicknames: write them in, and give the real name back for anyone who lost theirs. */
  function sync() {
    const s = YM.Store.isReady ? YM.Store.getState() : null;
    if (!s || !s.profiles) return;
    // A Yapper admin or moderator can edit other people's names; never risk saving a nickname as someone's real name.
    const nicks = s.isAdmin || s.isMod ? {} : read();
    const me = s.userId;
    let next = null;
    const edit = (id, name) => {
      const p = (next || s.profiles)[id];
      if (!p || p.display_name === name) return;
      next = next || { ...s.profiles };
      next[id] = { ...p, display_name: name };
    };
    for (const [id, nick] of Object.entries(nicks)) {
      if (id === me || typeof nick !== 'string' || !nick) continue;
      const p = s.profiles[id];
      if (!p) continue;
      if (p.display_name !== nick) {
        // What is in the store now is Yapper's real name, unless it is the previous nickname we wrote ourselves.
        if (!(applied.has(id) && p.display_name === applied.get(id))) original.set(id, p.display_name);
        applied.set(id, nick);
        edit(id, nick);
      } else if (!applied.has(id)) {
        // Their real name already is the nickname: nothing to write, nothing to give back.
        original.set(id, p.display_name);
        applied.set(id, nick);
      }
    }
    for (const id of [...applied.keys()]) {
      if (nicks[id] && id !== me) continue;
      const p = s.profiles[id];
      if (p && p.display_name === applied.get(id)) edit(id, original.get(id) === undefined ? null : original.get(id));
      applied.delete(id);
      original.delete(id);
    }
    if (next) YM.Store.setState({ profiles: next });
  }

  /** A small dialog to set or remove the nickname of one person. */
  function openEditor(userId) {
    const h = YM.dom.h;
    const p = YM.Store.profile(userId);
    if (!p) { YM.toast('That person is not loaded.', { type: 'error' }); return null; }
    if (userId === YM.Store.myId()) { YM.toast('Nicknames are for other people.', { type: 'error' }); return null; }
    const real = realName(userId);
    const input = h('input', { type: 'text', class: 'input', maxlength: MAX, placeholder: real, value: nicknameOf(userId), style: { width: '100%' }, 'aria-label': 'Nickname' });
    const save = (close) => {
      const name = setNickname(userId, input.value);
      YM.toast(name ? 'Nickname saved. Only you see it.' : 'Nickname removed.');
      close();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(modal.close); } });
    const modal = YM.modal.open({
      title: 'Nickname',
      subtitle: real + (p.username ? '  (@' + p.username + ')' : ''),
      body: h('div', {}, input, h('div', { class: 'ym-sub-hint', style: { marginTop: '10px' } }, 'Only you see this name. Nobody else, and Yapper itself, does not know about it. Leave it empty to go back to their own name.')),
      buttons: [{ label: 'Save', onClick: save }, nicknameOf(userId) ? { label: 'Remove nickname', danger: true, onClick: (close) => { setNickname(userId, ''); YM.toast('Nickname removed.'); close(); } } : null].filter(Boolean),
    });
    setTimeout(() => { input.focus(); input.select(); }, 0);
    return modal;
  }

  /** The list in the plugin's options: your friends (and everyone who has a nickname) with a box for the nickname. */
  function renderManager(box) {
    const h = YM.dom.h;
    box.style.flexDirection = 'column';
    box.style.alignItems = 'stretch';
    const list = h('div', { class: 'ym-fn-list' });
    let query = '';
    const search = h('input', { type: 'search', class: 'input', placeholder: 'Search friends, or anyone you have seen...', 'aria-label': 'Search people', style: { width: '100%' }, onInput: (e) => { query = e.target.value; draw(); } });

    const people = () => {
      const s = YM.Store.isReady ? YM.Store.getState() : null;
      if (!s || !s.profiles) return [];
      const nicks = read();
      const q = query.trim().toLowerCase().replace(/^@/, '');
      const ids = new Set();
      if (q) {
        for (const p of Object.values(s.profiles)) {
          if (!p || p.id === s.userId) continue;
          if (String(p.username || '').toLowerCase().includes(q) || String(realName(p.id)).toLowerCase().includes(q) || String(nicks[p.id] || '').toLowerCase().includes(q)) ids.add(p.id);
        }
      } else {
        for (const [id, st] of Object.entries(s.friends || {})) if (st === 'accepted') ids.add(id);
        for (const id of Object.keys(nicks)) ids.add(id);
      }
      return [...ids].map((id) => s.profiles[id]).filter((p) => p && p.id !== s.userId).sort((a, b) => !!nicks[b.id] - !!nicks[a.id] || realName(a.id).localeCompare(realName(b.id))).slice(0, 60);
    };

    function row(p) {
      const nick = nicknameOf(p.id);
      const url = YM.people.avatarUrl(p);
      const input = h('input', { type: 'text', class: 'input', maxlength: MAX, placeholder: 'Nickname (only you see it)', value: nick, 'aria-label': 'Nickname for ' + realName(p.id) });
      let done = false; // redrawing the list takes focus away from this box, which would save a second time in the middle of it
      const commit = () => {
        if (done || clean(input.value) === nicknameOf(p.id)) return;
        done = true;
        setNickname(p.id, input.value);
        draw();
      };
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
      return h('div', { class: 'ym-fn-item' },
        url ? h('img', { class: 'ym-fn-av', src: url, alt: '', width: 32, height: 32 }) : h('span', { class: 'ym-fn-av' }, realName(p.id).charAt(0).toUpperCase()),
        h('span', { class: 'ym-fn-name' }, h('b', {}, realName(p.id)), h('span', { class: 'hint' }, p.username ? ' @' + p.username : '')),
        input,
        nick ? h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-btn-ghost', title: 'Remove nickname', onClick: () => { setNickname(p.id, ''); draw(); } }, 'Reset') : null);
    }

    function draw() {
      const focus = document.activeElement === search;
      const items = people();
      list.replaceChildren();
      if (!YM.Store.isReady || !YM.Store.getState()) list.append(h('div', { class: 'hint' }, 'Your friends appear here once you are logged in and Yapper has loaded.'));
      else if (!items.length) list.append(h('div', { class: 'hint' }, query ? 'Nobody found. Try a username.' : 'No friends loaded yet. Search for a name above.'));
      for (const p of items) list.append(row(p));
      if (focus) search.focus();
    }

    const count = Object.keys(read()).length;
    box.append(
      h('div', { class: 'toggle-label' }, 'Your nicknames'),
      h('div', { class: 'hint' }, 'Type a nickname next to a friend and press Enter. Tip: you can also click someone to open their profile and press "Nickname", or right-click one of their messages. ' + (count ? count + ' nickname(s) set.' : '')),
      search,
      list,
      h('div', { class: 'ym-toolbar' }, h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-btn-ghost', onClick: () => {
        if (!Object.keys(read()).length) return;
        if (window.confirm('Remove all your nicknames?')) { YM.settings.set(KEY, {}); draw(); }
      } }, 'Remove all nicknames')));
    draw();
  }

  YM.definePlugin({
    name: 'FriendNicknames',
    description: 'Give a friend a nickname that only you see, like on Roblox. It shows in the friends list, chats, messages, voice and profile cards.',
    authors: ['YapCord'],
    tags: ['Friends', 'Chat', 'Customisation'],
    api: { read, clean, realName, nicknameOf, setNickname },
    options: {
      showReal: { type: 'boolean', default: false, description: 'Show the person\'s real name next to the nickname in messages' },
      manage: { type: 'custom', default: false, render: (box) => renderManager(box) },
    },
    start(ctx) {
      const h = YM.dom.h;
      let stopped = false;
      ctx.css(`
.ym-fn-list{display:flex;flex-direction:column;gap:6px;margin:8px 0;max-height:340px;overflow:auto;width:100%}
.ym-fn-item{display:flex;align-items:center;gap:10px}
.ym-fn-av{width:32px;height:32px;border-radius:50%;flex:none;display:grid;place-items:center;object-fit:cover;background:var(--bg-elev,rgba(255,255,255,.08));font-weight:700;color:var(--text-muted,#a6a8b0)}
.ym-fn-name{flex:1;min-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ym-fn-item input.input{width:170px;max-width:42%}
.ym-fn-real{margin-left:6px;font-size:12px;color:var(--text-faint,#6e6f7b);font-weight:500}
.ym-fn-btn{margin-top:8px}
`);

      // ---- keep the store in line with the nicknames --------------------------------------------------
      const go = () => { if (!stopped) sync(); };
      if (YM.Store.isReady) go(); else YM.Store.ready.then(go);
      ctx.on('store:change', (st, prev) => { if (st.profiles !== prev.profiles || st.isAdmin !== prev.isAdmin || st.isMod !== prev.isMod) go(); });
      ctx.cleanup(YM.settings.onPath(KEY, () => { go(); YM.messages.refresh(); }));
      ctx.cleanup(() => {
        stopped = true;
        // Give everyone their own name back.
        const s = YM.Store.isReady ? YM.Store.getState() : null;
        if (s && s.profiles && applied.size) {
          let next = null;
          for (const [id, nick] of applied) {
            const p = s.profiles[id];
            if (p && p.display_name === nick) {
              next = next || { ...s.profiles };
              next[id] = { ...p, display_name: original.get(id) === undefined ? null : original.get(id) };
            }
          }
          if (next) YM.Store.setState({ profiles: next });
        }
        applied.clear();
        original.clear();
      });

      // ---- real name next to the nickname in messages ---------------------------------------------------
      const decorate = ({ el, message }) => {
        const author = el.querySelector(':scope > .msg-body > .msg-head > .msg-author:not(.webhook-author)');
        if (!author) return;
        const existing = author.parentNode.querySelector(':scope > .ym-fn-real');
        const id = message && message.author_id;
        const want = ctx.settings.store.showReal && id && nicknameOf(id) && applied.has(id) ? realName(id) : '';
        if (!want) { if (existing) existing.remove(); return; }
        const text = '(' + want + ')';
        if (existing) { if (existing.textContent !== text) existing.textContent = text; return; }
        author.after(h('span', { class: 'ym-fn-real', title: 'Their own name' }, text));
      };
      ctx.cleanup(YM.messages.decorate(decorate));
      ctx.cleanup(ctx.settings.onChange(() => YM.messages.refresh()));
      ctx.on('store:change', (st, prev) => { if (st.profiles !== prev.profiles && ctx.settings.store.showReal) YM.messages.refresh(); });
      ctx.cleanup(() => document.querySelectorAll('.ym-fn-real').forEach((n) => n.remove()));

      // ---- "Nickname" on the profile card, and in the right-click menu of a message -----------------------
      let pending = null;
      const onContext = (e) => {
        const row = e.target instanceof Element ? e.target.closest('.msg[data-message-id]') : null;
        const msg = row ? YM.Store.findMessage(row.getAttribute('data-message-id')) : null;
        const id = msg && msg.author_id;
        const p = id && YM.Store.profile(id);
        pending = id && id !== YM.Store.myId() && p && !row.querySelector('.webhook-author') ? { id, at: Date.now() } : null;
      };
      document.addEventListener('contextmenu', onContext, true);
      ctx.cleanup(() => document.removeEventListener('contextmenu', onContext, true));

      const ui = () => {
        const s = YM.Store.getState();
        if (!s) return;
        document.querySelectorAll('.profile-card .pc2-head').forEach((head) => {
          const userId = s.profileCard;
          const btn = head.querySelector('.ym-fn-btn');
          const ok = typeof userId === 'string' && userId !== s.userId && !!s.profiles[userId];
          if (!ok) { if (btn) btn.remove(); return; }
          const label = nicknameOf(userId) ? 'Change nickname' : 'Nickname';
          if (btn && btn.getAttribute('data-user') === userId && btn.textContent === label) return;
          if (btn) btn.remove();
          head.append(h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-fn-btn', 'data-user': userId, onClick: () => openEditor(userId) }, label));
        });
        document.querySelectorAll('.ctx-menu').forEach((menu) => {
          if (!pending || Date.now() - pending.at > 3000 || menu.querySelector('.ym-fn-menu')) return;
          const id = pending.id;
          menu.append(h('button', { type: 'button', role: 'menuitem', class: 'ym-fn-menu', onClick: () => {
            const overlay = menu.closest('.overlay');
            if (overlay) overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            openEditor(id);
          } }, h('span', {}, 'Nickname for ' + realName(id) + '...')));
        });
        if (!document.querySelector('.ctx-menu') && pending && Date.now() - pending.at > 400) pending = null;
      };
      ctx.onMutate(ui);
      ctx.on('store:change', (st, prev) => { if (st.profileCard !== prev.profileCard) ui(); });
      ctx.cleanup(YM.settings.onPath(KEY, ui));
      ui();
      ctx.cleanup(() => document.querySelectorAll('.ym-fn-btn,.ym-fn-menu').forEach((n) => n.remove()));
    },
  });
})();
