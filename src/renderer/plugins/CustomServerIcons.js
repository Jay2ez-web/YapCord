// CustomServerIcons: give a server your own icon (a picture, or an emoji/letters on a colour) in your server list.
// It is only shown to you: nothing is sent to Yapper, other people keep seeing the real icon. Handy for a tidier list.
//
// How: Yapper's own icon stays in place; a layer with your icon is added on top of it (so Yapper's unread dots, badges, drag
// and right-click keep working and nothing needs to be patched). The icons are kept in your YapCord settings (a small
// picture each) and are part of "Backup".
(function () {
  const KEY = 'pluginData.CustomServerIcons';
  const TARGETS = 'nav.rail button.rail-item:not(.rail-folder):not(.add), .ym-bf-sidebar button.rail-item:not(.rail-folder), nav.rail .folder-mini';

  const read = () => {
    const v = YM.settings.get(KEY, {});
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  };
  const write = (map) => YM.settings.set(KEY, map);
  const validEntry = (e) => !!e && ((e.t === 'img' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(e.src || '')) || (e.t === 'text' && typeof e.text === 'string' && e.text.length > 0));

  function setIcon(serverId, entry) {
    if (!serverId || !validEntry(entry)) return false;
    write({ ...read(), [serverId]: entry });
    return true;
  }
  function clearIcon(serverId) {
    const map = { ...read() };
    if (!(serverId in map)) return false;
    delete map[serverId];
    write(map);
    return true;
  }

  /** Cut a picture file to a small centred square (PNG/WebP). A small animated GIF is kept as it is, so it keeps moving. */
  async function toSquare(file, size) {
    if (!file || !/^image\//.test(file.type || '')) throw new Error('That is not a picture.');
    if (file.size > 15 * 1024 * 1024) throw new Error('That picture is too large (over 15 MB).');
    if (file.type === 'image/gif' && file.size <= 256 * 1024) {
      return await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('Could not read that file.'));
        r.readAsDataURL(file);
      });
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const w = img.naturalWidth || size;
      const hh = img.naturalHeight || size;
      const side = Math.min(w, hh);
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      c.getContext('2d').drawImage(img, (w - side) / 2, (hh - side) / 2, side, side, 0, 0, size, size);
      const webp = c.toDataURL('image/webp', 0.9);
      return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const serverIdOf = (el) => YM.people.serverIdOf(el);

  const graphemes = (text) => (typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(String(text || ''))].map((x) => x.segment) : Array.from(String(text || '')));
  const shortText = (text) => graphemes(String(text || '').trim()).slice(0, 3).join('');

  /** Fill a layer element for an entry. */
  function paintLayer(span, entry) {
    const key = entry.t === 'img' ? 'i:' + entry.src : 't:' + entry.text + '|' + (entry.bg || '');
    if (span.getAttribute('data-key') === key) return;
    span.setAttribute('data-key', key);
    span.textContent = '';
    span.style.cssText = '';
    if (entry.t === 'img') {
      span.style.backgroundImage = 'url("' + entry.src + '")';
    } else {
      span.textContent = entry.text;
      span.style.backgroundColor = /^#[0-9a-f]{6}$/i.test(entry.bg || '') ? entry.bg : '#5865f2';
      const n = graphemes(entry.text).length;
      span.style.fontSize = n <= 1 ? '1.55em' : n === 2 ? '1.15em' : '.85em';
    }
  }

  function pickColor(hex) {
    return /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#5865f2';
  }

  /** The "Custom icon" dialog for one server. */
  function openEditor(serverId) {
    const h = YM.dom.h;
    const s = YM.Store.getState();
    const server = s && s.servers && s.servers[serverId];
    if (!server) { YM.toast('That server is not loaded.', { type: 'error' }); return null; }
    const current = read()[serverId];
    const preview = h('span', { class: 'ym-csi-prev' });
    const refresh = () => {
      const e = read()[serverId];
      preview.replaceChildren();
      if (e && validEntry(e)) {
        const layer = h('span', { class: 'ym-csi' });
        paintLayer(layer, e);
        preview.append(layer);
      } else {
        preview.append(h('span', { class: 'ym-csi-none' }, (server.name || '?').trim().charAt(0).toUpperCase()));
      }
      reset.disabled = !(e && validEntry(e));
    };
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true, onChange: async () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (!f) return;
      try {
        setIcon(serverId, { t: 'img', src: await toSquare(f, 128) });
        YM.toast('Icon saved. Only you see it.');
      } catch (err) {
        YM.toast((err && err.message) || 'Could not use that picture.', { type: 'error' });
      }
      refresh();
    } });
    const text = h('input', { type: 'text', class: 'input', maxlength: 12, placeholder: '🎮 or ABC', value: current && current.t === 'text' ? current.text : '', style: { width: '110px' } });
    const color = h('input', { type: 'color', value: pickColor(current && current.t === 'text' ? current.bg : ''), style: { width: '44px', height: '34px', padding: 0, border: 0, background: 'none' }, 'aria-label': 'Background colour' });
    const apply = () => {
      const t = shortText(text.value);
      if (!t) { YM.toast('Type an emoji or up to three letters first.', { type: 'error' }); return; }
      setIcon(serverId, { t: 'text', text: t, bg: color.value });
      text.value = t;
      YM.toast('Icon saved. Only you see it.');
      refresh();
    };
    const reset = h('button', { type: 'button', class: 'ym-btn ym-btn-ghost', onClick: () => { clearIcon(serverId); YM.toast('Back to the original icon.'); refresh(); } }, 'Use the original icon');
    const body = h('div', {},
      h('div', { class: 'ym-csi-row' }, preview, h('div', {},
        h('button', { type: 'button', class: 'ym-btn', onClick: () => input.click() }, 'Choose picture...'),
        h('div', { class: 'ym-sub-hint' }, 'PNG, JPG, WebP or a small GIF. It is cut to a square.'))),
      h('div', { class: 'ym-sub' }, 'Or an emoji / letters'),
      h('div', { class: 'ym-csi-row' }, text, color, h('button', { type: 'button', class: 'ym-btn', onClick: apply }, 'Use this')),
      h('div', { class: 'ym-sub-hint', style: { marginTop: '12px' } }, 'Only you see this icon. Nobody else, and Yapper itself, does not know about it.'),
      h('div', { style: { marginTop: '10px' } }, reset),
      input);
    refresh();
    return YM.modal.open({ title: 'Custom server icon', subtitle: server.name, body });
  }

  /** The list in the plugin's options: every server with its icon and an Edit button. */
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
      if (!servers.length) {
        list.append(h('div', { class: 'hint' }, 'Your servers appear here once you are logged in and Yapper has loaded.'));
        return;
      }
      for (const sv of servers) {
        const e = map[sv.id];
        const prev = h('span', { class: 'ym-csi-prev small' });
        if (e && validEntry(e)) {
          const layer = h('span', { class: 'ym-csi' });
          paintLayer(layer, e);
          prev.append(layer);
        } else prev.append(h('span', { class: 'ym-csi-none' }, String(sv.name || '?').trim().charAt(0).toUpperCase()));
        list.append(h('div', { class: 'ym-csi-item' }, prev,
          h('span', { class: 'ym-csi-name' }, sv.name),
          h('button', { type: 'button', class: 'ym-btn ym-btn-small', onClick: () => { const m = openEditor(sv.id); if (m) { const off = new MutationObserver(() => { if (!m.el.isConnected) { off.disconnect(); draw(); } }); off.observe(document.body, { childList: true }); } } }, e ? 'Change' : 'Set icon'),
          e ? h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-btn-ghost', onClick: () => { clearIcon(sv.id); draw(); } }, 'Reset') : null));
      }
    };
    const count = Object.keys(read()).length;
    box.append(
      h('div', { class: 'toggle-label' }, 'Your icons'),
      h('div', { class: 'hint' }, 'Pick a server to give it your own icon. Tip: you can also right-click a server in the list and choose "Custom icon...". ' + (count ? count + ' server(s) have a custom icon.' : '')),
      list,
      h('div', { class: 'ym-toolbar' }, h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-btn-ghost', onClick: () => {
        if (!Object.keys(read()).length) return;
        if (window.confirm('Remove all your custom server icons?')) { write({}); draw(); }
      } }, 'Remove all custom icons')));
    draw();
  }

  YM.definePlugin({
    name: 'CustomServerIcons',
    description: 'Give any server your own icon (a picture or an emoji) in your server list, just for you. Right-click a server and choose "Custom icon...".',
    authors: ['YapCord'],
    tags: ['Servers', 'Appearance', 'Customisation'],
    api: { read, setIcon, clearIcon, serverIdOf, validEntry, shortText },
    options: {
      manage: { type: 'custom', default: false, render: (box) => renderManager(box) },
    },
    start(ctx) {
      const h = YM.dom.h;
      ctx.css(`
nav.rail button.rail-item:has(>.ym-csi),.ym-bf-sidebar button.rail-item:has(>.ym-csi),nav.rail .folder-mini:has(>.ym-csi){position:relative;overflow:hidden;color:transparent}
nav.rail button.rail-item:has(>.ym-csi)>*:not(.ym-csi),.ym-bf-sidebar button.rail-item:has(>.ym-csi)>*:not(.ym-csi),nav.rail .folder-mini:has(>.ym-csi)>*:not(.ym-csi){visibility:hidden}
.ym-csi{position:absolute;inset:0;border-radius:inherit;display:flex;align-items:center;justify-content:center;background-size:cover;background-position:center;background-repeat:no-repeat;color:#fff;font-weight:700;line-height:1;pointer-events:none;z-index:1;user-select:none}
.ym-csi-prev{position:relative;overflow:hidden;width:56px;height:56px;border-radius:16px;background:var(--bg-elev,rgba(255,255,255,.08));flex:none;display:grid;place-items:center}
.ym-csi-prev.small{width:36px;height:36px;border-radius:11px}
.ym-csi-prev .ym-csi{font-size:22px}.ym-csi-prev.small .ym-csi{font-size:15px}
.ym-csi-none{font-weight:700;color:var(--text-muted,#a6a8b0);font-size:20px}
.ym-csi-row{display:flex;align-items:center;gap:12px;margin:8px 0}
.ym-sub-hint{font-size:12px;color:var(--text-muted,#a6a8b0);margin-top:4px}
.ym-csi-list{display:flex;flex-direction:column;gap:6px;margin:8px 0;max-height:320px;overflow:auto;width:100%}
.ym-csi-item{display:flex;align-items:center;gap:10px}
.ym-csi-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`);

      // ---- put the layers on the buttons ------------------------------------------------------------------
      const sync = () => {
        const map = read();
        for (const el of document.querySelectorAll(TARGETS)) {
          if (el.matches('button[title="Direct messages"],button[aria-label="Direct messages"]')) continue;
          const layer = el.querySelector(':scope > .ym-csi');
          const id = serverIdOf(el);
          const entry = id && map[id];
          if (id && entry && validEntry(entry)) {
            const target = layer || h('span', { class: 'ym-csi', 'aria-hidden': 'true' });
            paintLayer(target, entry);
            if (!layer) el.append(target);
          } else if (layer && id) {
            layer.remove();
          }
        }
      };
      sync();
      ctx.onMutate(sync);
      ctx.cleanup(YM.settings.onPath(KEY, sync));
      ctx.cleanup(() => document.querySelectorAll('.rail .ym-csi,.ym-bf-sidebar .ym-csi').forEach((n) => n.remove()));

      // ---- "Custom icon..." in the right-click menu of a server and in the server menu ----------------------
      let pending = null;
      const onContext = (e) => {
        const btn = e.target instanceof Element ? e.target.closest(TARGETS) : null;
        const id = btn ? serverIdOf(btn) : null;
        pending = id ? { id, at: Date.now() } : null;
      };
      document.addEventListener('contextmenu', onContext, true);
      ctx.cleanup(() => document.removeEventListener('contextmenu', onContext, true));

      const addItem = (menu, serverId, cls) => {
        if (menu.querySelector('.' + cls)) return;
        menu.append(h('button', { type: 'button', role: 'menuitem', class: cls, onClick: () => {
          const overlay = menu.closest('.overlay');
          if (overlay) overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          openEditor(serverId);
        } }, h('span', {}, 'Custom icon...')));
      };
      const menus = () => {
        const st = YM.Store.getState();
        document.querySelectorAll('.ctx-menu').forEach((menu) => {
          if (pending && Date.now() - pending.at < 3000) addItem(menu, pending.id, 'ym-csi-item-menu');
        });
        if (!document.querySelector('.ctx-menu') && pending && Date.now() - pending.at > 400) pending = null;
        document.querySelectorAll('.server-menu').forEach((menu) => {
          if (st && st.activeServerId) addItem(menu, st.activeServerId, 'ym-csi-item-menu');
        });
      };
      ctx.onMutate(menus);
      ctx.cleanup(() => document.querySelectorAll('.ym-csi-item-menu').forEach((n) => n.remove()));
    },
  });
})();
