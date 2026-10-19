// ServerAccent: a different accent colour for each server. When you open a server, Yapper's buttons, highlights and
// unread dots take that server's colour; in direct messages the normal colour comes back. Only on your screen.
(function () {
  const KEY = 'pluginData.ServerAccent';
  const valid = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  const read = () => { const v = YM.settings.get(KEY, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  function onColor(hex) {
    const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#14151a' : '#ffffff';
  }
  const darker = (hex, k) => '#' + rgb(hex).map((v) => Math.max(0, Math.round(v * k)).toString(16).padStart(2, '0')).join('');
  const cssFor = (hex) => ':root:root{--accent:' + hex + ';--accent-hover:' + darker(hex, 0.86) + ';--accent-soft:' + hex + '29;--on-accent:' + onColor(hex) + '}';
  const set = (id, hex) => { const m = { ...read() }; if (valid(hex)) m[id] = hex; else delete m[id]; YM.settings.set(KEY, m); };
  /** A pleasant colour for a server that has none yet (from its id, so it is always the same). */
  function suggest(id) {
    let n = 0;
    for (const c of String(id)) n = (n * 31 + c.charCodeAt(0)) % 360;
    const f = (k) => { const a = (n / 60 + k) % 6; return Math.round(255 * (0.62 - 0.38 * Math.max(0, Math.min(1, Math.min(a - 1, 4 - a))))); };
    return '#' + [f(5), f(3), f(1)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function openEditor(serverId) {
    const h = YM.dom.h;
    const st = YM.Store.getState();
    const server = st && st.servers && st.servers[serverId];
    if (!server) { YM.toast('That server is not loaded.', { type: 'error' }); return null; }
    const cur = read()[serverId];
    const input = h('input', { type: 'color', value: valid(cur) ? cur : suggest(serverId), 'aria-label': 'Accent colour for ' + server.name, style: { width: '64px', height: '40px', padding: 0, border: 0, background: 'none' } });
    const modal = YM.modal.open({
      title: 'Server colour',
      subtitle: server.name,
      body: h('div', {}, h('div', { class: 'ym-toolbar' }, input, h('span', { class: 'hint' }, 'Buttons, highlights and unread dots use this colour while you are in this server.')), h('div', { class: 'ym-sub-hint', style: { marginTop: '8px' } }, 'Only you see this colour.')),
      buttons: [{ label: 'Save', onClick: (close) => { set(serverId, input.value); YM.toast('Server colour saved.'); close(); } }, cur ? { label: 'Use the normal colour', danger: true, onClick: (close) => { set(serverId, ''); close(); } } : null].filter(Boolean),
    });
    return modal;
  }

  function renderManager(box) {
    const h = YM.dom.h;
    box.style.flexDirection = 'column';
    box.style.alignItems = 'stretch';
    const list = h('div', { class: 'ym-csi-list' });
    const draw = () => {
      const s = YM.Store.isReady ? YM.Store.getState() : null;
      const servers = s && s.servers ? Object.values(s.servers).filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name))) : [];
      const map = read();
      list.replaceChildren();
      if (!servers.length) { list.append(h('div', { class: 'hint' }, 'Your servers appear here once you are logged in and Yapper has loaded.')); return; }
      for (const sv of servers) {
        const c = map[sv.id];
        const input = h('input', { type: 'color', value: valid(c) ? c : suggest(sv.id), 'aria-label': 'Colour for ' + sv.name, style: { width: '44px', height: '30px', padding: 0, border: 0, background: 'none' }, onChange: (e) => { set(sv.id, e.target.value); draw(); } });
        list.append(h('div', { class: 'ym-csi-item' }, input, h('span', { class: 'ym-csi-name' }, sv.name), valid(c) ? h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-btn-ghost', onClick: () => { set(sv.id, ''); draw(); } }, 'Reset') : h('span', { class: 'hint' }, 'normal')));
      }
    };
    box.append(h('div', { class: 'toggle-label' }, 'Your server colours'), h('div', { class: 'hint' }, 'Pick a colour next to a server. Tip: you can also right-click a server and choose "Server colour...".'), list);
    draw();
  }

  YM.definePlugin({
    name: 'ServerAccent',
    description: 'Give each server its own accent colour. Buttons, highlights and unread dots change when you open that server. Only you see it.',
    authors: ['YapCord'],
    tags: ['Servers', 'Appearance', 'Customisation'],
    api: { cssFor, valid, read, set, suggest },
    options: { manage: { type: 'custom', default: false, render: (box) => renderManager(box) } },
    start(ctx) {
      const h = YM.dom.h;
      const apply = () => {
        const st = YM.Store.getState();
        const sid = st ? YM.people.currentServerId() : null;
        const c = sid && read()[sid];
        ctx.css(valid(c) ? cssFor(c) : '');
      };
      apply();
      ctx.on('store:change', (st, prev) => { if (st.activeServerId !== prev.activeServerId || st.activeChannelId !== prev.activeChannelId) apply(); });
      ctx.cleanup(YM.settings.onPath(KEY, apply));

      // "Server colour..." in the right-click menu of a server and in the server menu
      let pending = null;
      const onContext = (e) => {
        const btn = e.target instanceof Element ? e.target.closest('nav.rail button.rail-item:not(.rail-folder):not(.add), .ym-bf-sidebar button.rail-item:not(.rail-folder)') : null;
        const id = btn ? YM.people.serverIdOf(btn) : null;
        pending = id ? { id, at: Date.now() } : null;
      };
      document.addEventListener('contextmenu', onContext, true);
      ctx.cleanup(() => document.removeEventListener('contextmenu', onContext, true));
      const addItem = (menu, serverId) => {
        if (menu.querySelector('.ym-sa-item')) return;
        menu.append(h('button', { type: 'button', role: 'menuitem', class: 'ym-sa-item', onClick: () => {
          const overlay = menu.closest('.overlay');
          if (overlay) overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          openEditor(serverId);
        } }, h('span', {}, 'Server colour...')));
      };
      ctx.onMutate(() => {
        const st = YM.Store.getState();
        document.querySelectorAll('.ctx-menu').forEach((m) => { if (pending && Date.now() - pending.at < 3000) addItem(m, pending.id); });
        if (!document.querySelector('.ctx-menu') && pending && Date.now() - pending.at > 400) pending = null;
        document.querySelectorAll('.server-menu').forEach((m) => { if (st && st.activeServerId) addItem(m, st.activeServerId); });
      });
      ctx.cleanup(() => document.querySelectorAll('.ym-sa-item').forEach((n) => n.remove()));
    },
  });
})();
