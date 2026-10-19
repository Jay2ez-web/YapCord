// NameStyle: your own colour and font for anybody's name in chat (servers and direct messages). Only on your screen,
// nobody else sees it and Yapper is not told. Works next to FriendNicknames: a nickname can have its own colour too.
(function () {
  const KEY = 'pluginData.NameStyle';
  const FONTS = {
    system: ['System', 'ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif'],
    rounded: ['Rounded', 'ui-rounded, "Nunito", "Varela Round", "Segoe UI", system-ui, sans-serif'],
    serif: ['Serif', 'Georgia, "Iowan Old Style", "Palatino Linotype", Cambria, serif'],
    mono: ['Monospace', 'ui-monospace, "Cascadia Code", Consolas, "SFMono-Regular", Menlo, monospace'],
    script: ['Handwriting', '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive'],
    impact: ['Heavy', 'Impact, "Arial Black", "Franklin Gothic Heavy", sans-serif'],
  };
  const validColour = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  /** A saved style cleaned up: { c: '#rrggbb', f: fontKey, b: true } with only the parts that are valid (null when nothing is left). */
  function validEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const out = {};
    if (validColour(e.c)) out.c = String(e.c).toLowerCase();
    if (typeof e.f === 'string' && Object.prototype.hasOwnProperty.call(FONTS, e.f)) out.f = e.f;
    if (e.b === true) out.b = true;
    return Object.keys(out).length ? out : null;
  }
  const read = () => {
    const v = YM.settings.get(KEY, {});
    const out = {};
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const [id, e] of Object.entries(v)) { const c = validEntry(e); if (c && /^[\w-]{1,64}$/.test(id)) out[id] = c; }
    return out;
  };
  const set = (id, entry) => {
    const m = read();
    const c = validEntry(entry);
    if (c) m[id] = c; else delete m[id];
    YM.settings.set(KEY, m);
  };

  const STYLE = '.msg-author[data-ym-nsc]:not([data-ym-fx]){color:var(--ym-nsc)!important}.msg-author[data-ym-nsb]{font-weight:800!important}'
    + Object.entries(FONTS).map(([k, v]) => '.msg-author[data-ym-nsf="' + k + '"]{font-family:' + v[1] + '!important}').join('');

  function nameOf(id) {
    const p = YM.Store.profile(id);
    return p ? p.display_name || p.username || 'this person' : 'this person';
  }

  function openEditor(userId) {
    const h = YM.dom.h;
    const cur = read()[userId] || {};
    const colour = h('input', { type: 'color', value: cur.c || '#6c8cff', 'aria-label': 'Name colour', style: { width: '56px', height: '36px', padding: 0, border: 0, background: 'none' } });
    const useColour = h('input', { type: 'checkbox', id: 'ym-ns-use', checked: !!cur.c });
    const font = h('select', { class: 'ym-select', 'aria-label': 'Font' }, h('option', { value: '' }, 'Normal'), ...Object.entries(FONTS).map(([k, v]) => h('option', { value: k, selected: cur.f === k }, v[0])));
    const bold = h('input', { type: 'checkbox', id: 'ym-ns-bold', checked: !!cur.b });
    const preview = h('div', { class: 'ym-ns-preview' }, nameOf(userId));
    const read2 = () => ({ c: useColour.checked ? colour.value : undefined, f: font.value || undefined, b: bold.checked || undefined });
    const draw = () => {
      const e = validEntry(read2()) || {};
      preview.style.color = e.c || '';
      preview.style.fontFamily = e.f ? FONTS[e.f][1] : '';
      preview.style.fontWeight = e.b ? '800' : '';
    };
    for (const el of [colour, useColour, font, bold]) el.addEventListener('input', draw);
    colour.addEventListener('input', () => { useColour.checked = true; draw(); });
    draw();
    return YM.modal.open({
      title: 'Name style',
      subtitle: nameOf(userId),
      body: h('div', {},
        h('div', { class: 'ym-toolbar' }, colour, h('label', { for: 'ym-ns-use' }, useColour, ' Use this colour')),
        h('div', { class: 'ym-toolbar', style: { marginTop: '8px' } }, h('span', {}, 'Font'), font, h('label', { for: 'ym-ns-bold' }, bold, ' Bold')),
        preview,
        h('div', { class: 'ym-sub-hint', style: { marginTop: '8px' } }, 'Only you see this. It shows in chat messages, in servers and in direct messages.')),
      buttons: [
        { label: 'Save', onClick: (close) => { set(userId, read2()); close(); } },
        validEntry(cur) ? { label: 'Remove style', danger: true, onClick: (close) => { set(userId, null); close(); } } : null,
      ].filter(Boolean),
    });
  }

  function renderManager(box) {
    const h = YM.dom.h;
    box.style.flexDirection = 'column';
    box.style.alignItems = 'stretch';
    const list = h('div', { class: 'ym-csi-list' });
    const draw = () => {
      const m = read();
      list.replaceChildren();
      const ids = Object.keys(m).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      if (!ids.length) { list.append(h('div', { class: 'hint' }, 'Nobody has a style yet. Right-click one of their messages and choose "Name style...".')); return; }
      for (const id of ids) {
        const e = m[id];
        list.append(h('div', { class: 'ym-csi-item' },
          h('span', { class: 'ym-csi-name', style: { color: e.c || '', fontFamily: e.f ? FONTS[e.f][1] : '', fontWeight: e.b ? '800' : '' } }, nameOf(id)),
          h('button', { type: 'button', class: 'ym-btn ym-btn-small', onClick: () => openEditor(id) }, 'Edit'),
          h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-btn-ghost', onClick: () => { set(id, null); draw(); } }, 'Remove')));
      }
    };
    const off = YM.settings.onPath(KEY, draw);
    const obs = new MutationObserver(() => { if (!box.isConnected) { off(); obs.disconnect(); } });
    obs.observe(document.body, { childList: true, subtree: true });
    box.append(h('div', { class: 'toggle-label' }, 'People with a style'), list,
      h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-btn-danger', onClick: () => { if (Object.keys(read()).length && confirm('Remove all name styles?')) { YM.settings.set(KEY, {}); } } }, 'Remove all...'));
    draw();
  }

  YM.definePlugin({
    name: 'NameStyle',
    description: 'Give anybody\'s name your own colour and font in chat (servers and direct messages). Only you see it.',
    authors: ['YapCord'],
    tags: ['Appearance', 'Chat', 'Customisation'],
    api: { read, set, validEntry, FONTS },
    options: { manage: { type: 'custom', default: false, render: (box) => renderManager(box) } },
    start(ctx) {
      const h = YM.dom.h;
      ctx.css(STYLE + '.ym-ns-preview{margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--bg-elev,rgba(255,255,255,.06));font-size:16px;font-weight:600}');
      const apply = ({ el, message }) => {
        const author = el.querySelector(':scope > .msg-body > .msg-head > .msg-author:not(.webhook-author)');
        if (!author) return;
        const e = message && message.author_id ? read()[message.author_id] : null;
        const sync = (attr, value) => { if (value === undefined || value === null || value === false) { if (author.hasAttribute(attr)) author.removeAttribute(attr); } else if (author.getAttribute(attr) !== String(value === true ? '' : value)) author.setAttribute(attr, value === true ? '' : value); };
        sync('data-ym-nsc', e && e.c ? e.c : null);
        if (e && e.c) { if (author.style.getPropertyValue('--ym-nsc') !== e.c) author.style.setProperty('--ym-nsc', e.c); } else if (author.style.getPropertyValue('--ym-nsc')) author.style.removeProperty('--ym-nsc');
        sync('data-ym-nsf', e && e.f ? e.f : null);
        sync('data-ym-nsb', e && e.b ? true : null);
      };
      ctx.cleanup(YM.messages.decorate(apply));
      ctx.cleanup(YM.settings.onPath(KEY, () => YM.messages.refresh()));
      ctx.cleanup(() => document.querySelectorAll('.msg-author[data-ym-nsc],.msg-author[data-ym-nsf],.msg-author[data-ym-nsb]').forEach((n) => { n.removeAttribute('data-ym-nsc'); n.removeAttribute('data-ym-nsf'); n.removeAttribute('data-ym-nsb'); n.style.removeProperty('--ym-nsc'); }));

      // ---- "Name style..." in the right-click menu of a message, and on the profile card ----------------
      let pending = null;
      const onContext = (e) => {
        const row = e.target instanceof Element ? e.target.closest('.msg[data-message-id]') : null;
        const msg = row ? YM.Store.findMessage(row.getAttribute('data-message-id')) : null;
        const id = msg && msg.author_id;
        pending = id && YM.Store.profile(id) && !row.querySelector('.webhook-author') ? { id, at: Date.now() } : null;
      };
      document.addEventListener('contextmenu', onContext, true);
      ctx.cleanup(() => document.removeEventListener('contextmenu', onContext, true));
      const ui = () => {
        const s = YM.Store.getState();
        if (!s) return;
        document.querySelectorAll('.profile-card .pc2-head').forEach((head) => {
          const userId = s.profileCard;
          const btn = head.querySelector('.ym-ns-btn');
          const ok = typeof userId === 'string' && !!s.profiles[userId];
          if (!ok) { if (btn) btn.remove(); return; }
          if (btn && btn.getAttribute('data-user') === userId) return;
          if (btn) btn.remove();
          head.append(h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-ns-btn', 'data-user': userId, onClick: () => openEditor(userId) }, 'Name style'));
        });
        document.querySelectorAll('.ctx-menu').forEach((menu) => {
          if (!pending || Date.now() - pending.at > 3000 || menu.querySelector('.ym-ns-menu')) return;
          const id = pending.id;
          menu.append(h('button', { type: 'button', role: 'menuitem', class: 'ym-ns-menu', onClick: () => {
            const overlay = menu.closest('.overlay');
            if (overlay) overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            openEditor(id);
          } }, h('span', {}, 'Name style for ' + nameOf(id) + '...')));
        });
        if (!document.querySelector('.ctx-menu') && pending && Date.now() - pending.at > 400) pending = null;
      };
      ctx.onMutate(ui);
      ctx.on('store:change', (st, prev) => { if (st.profileCard !== prev.profileCard) ui(); });
      ui();
      ctx.cleanup(() => document.querySelectorAll('.ym-ns-btn,.ym-ns-menu').forEach((n) => n.remove()));
    },
  });
})();
