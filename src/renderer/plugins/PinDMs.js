// PinDMs (port): pin direct messages and group chats to the top of your DM list, like Vencord's PinDMs.
// Right-click a chat in the DM list and choose "Pin chat" / "Unpin chat". Pinned chats sit under a "Pinned" heading, in the order you
// pinned them (change the order, or unpin, in this plugin's options). Nothing in Yapper's list is moved or rewritten: the order is
// done with CSS (flex "order"), so Yapper's own list keeps working and unread badges, muting and closing behave as before.
(function () {
  const PIN_MASK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 17v5M9 3h6l-1 7 3 3H7l3-3z'/%3E%3C/svg%3E\")";
  const PIN_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 7 3 3H7l3-3z"/></svg>';

  /** A clean list of unique, non-empty string ids (what is stored may come from an old or edited settings file). */
  function normalise(list) {
    const out = [];
    if (!Array.isArray(list)) return out;
    for (const v of list) if (typeof v === 'string' && v && !out.includes(v) && out.length < 200) out.push(v);
    return out;
  }

  /** The CSS that puts the pinned rows first. Empty when nothing is pinned, so the list is then exactly Yapper's own. */
  function cssFor(ids) {
    if (!ids.length) return '';
    const q = (id) => '"' + String(id).replace(/["\\]/g, '\\$&') + '"';
    let css = '[data-ym-dm-list]{display:flex;flex-direction:column}\n'
      + '[data-ym-dm-list]>*{flex-shrink:0}\n'
      + '[data-ym-dm-list]>.section-label.ym-pin-label,[data-ym-dm-list]>.ym-pin-label{order:100}\n'
      + '[data-ym-dm-list]>.section-label:not(.ym-pin-label){order:2000}\n'
      + '[data-ym-dm-list]>.chat-row[data-nav-chan]{order:3000}\n'
      + '.chat-row[data-ym-pinned]::after{content:"";position:absolute;top:5px;right:6px;width:11px;height:11px;background:var(--text-faint,#8b8d98);-webkit-mask:' + PIN_MASK + ' center/contain no-repeat;mask:' + PIN_MASK + ' center/contain no-repeat;pointer-events:none}\n'
      + '.ym-pin-label{pointer-events:none}\n';
    ids.forEach((id, i) => { css += '[data-ym-dm-list]>.chat-row[data-nav-chan=' + q(id) + ']{order:' + (101 + i) + '}\n'; });
    return css;
  }

  function titleOf(id) {
    const s = YM.Store.getState();
    const ch = s && s.channels && s.channels[id];
    if (!ch) return 'Unknown chat';
    try {
      const f = YM.Store.api && YM.Store.api.channelTitle;
      if (typeof f === 'function') return String(f(ch, s) || 'Chat');
    } catch (_) { /* fall through */ }
    return ch.name || 'Chat';
  }

  YM.definePlugin({
    name: 'PinDMs',
    description: 'Pin chats to the top of your DM list. Right-click a chat and choose Pin chat; reorder or unpin in the options.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Appearance'],
    api: { normalise, cssFor },
    options: {
      pinned: {
        type: 'custom',
        default: [],
        render(box, plugin) {
          const h = YM.dom.h;
          const draw = () => {
            const ids = normalise(plugin.settings.store.pinned);
            box.replaceChildren(
              h('div', { class: 'toggle-label' }, 'Pinned chats'),
              ids.length
                ? h('div', { class: 'ym-pin-list' }, ids.map((id, i) => h('div', { class: 'ym-pin-item' },
                  h('span', { class: 'ym-pin-name' }, titleOf(id)),
                  h('button', { class: 'ym-btn ym-btn-small ym-btn-ghost', type: 'button', title: 'Move up', disabled: i === 0, onClick: () => move(id, -1) }, '↑'),
                  h('button', { class: 'ym-btn ym-btn-small ym-btn-ghost', type: 'button', title: 'Move down', disabled: i === ids.length - 1, onClick: () => move(id, 1) }, '↓'),
                  h('button', { class: 'ym-btn ym-btn-small ym-btn-ghost', type: 'button', onClick: () => plugin.settings.set('pinned', ids.filter((x) => x !== id)) }, 'Unpin'))))
                : h('div', { class: 'hint' }, 'Nothing pinned yet. Right-click a chat in your DM list and choose "Pin chat".'));
          };
          const move = (id, dir) => {
            const ids = normalise(plugin.settings.store.pinned);
            const i = ids.indexOf(id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= ids.length) return;
            [ids[i], ids[j]] = [ids[j], ids[i]];
            plugin.settings.set('pinned', ids);
          };
          draw();
          const off = plugin.settings.onChange((key) => {
            if (!box.isConnected) { off(); return; }
            if (key === 'pinned') draw();
          });
        },
      },
    },
    start(ctx) {
      const h = YM.dom.h;
      const pinned = () => normalise(ctx.settings.store.pinned);
      const isPinned = (id) => pinned().includes(id);
      const setPinned = (list) => ctx.settings.set('pinned', normalise(list));
      const toggle = (id) => setPinned(isPinned(id) ? pinned().filter((x) => x !== id) : [...pinned(), id]);

      ctx.css('.ym-pin-list{display:flex;flex-direction:column;gap:6px;margin-top:6px}.ym-pin-item{display:flex;gap:6px;align-items:center}.ym-pin-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}');
      const sheetId = 'plugin-PinDMs-order';
      const applyCss = () => { YM.dom.css.set(sheetId, cssFor(pinned())); };
      applyCss();
      ctx.cleanup(() => YM.dom.css.remove(sheetId));
      ctx.cleanup(ctx.settings.onChange((key) => { if (key === 'pinned') { applyCss(); sync(); } }));

      // Keep the DM list marked (attributes only: React never touches attributes it did not set) and the "Pinned" heading in place.
      function sync() {
        const ids = pinned();
        document.querySelectorAll('.sidebar-scroll').forEach((scroll) => {
          const head = scroll.parentElement && scroll.parentElement.querySelector(':scope > .sidebar-head');
          const isDm = !!head && !head.classList.contains('server-head');
          if (scroll.hasAttribute('data-ym-dm-list') !== isDm) scroll.toggleAttribute('data-ym-dm-list', isDm);
          let present = 0;
          scroll.querySelectorAll(':scope > .chat-row[data-nav-chan]').forEach((row) => {
            const on = isDm && ids.includes(row.getAttribute('data-nav-chan'));
            if (on) present++;
            if (row.hasAttribute('data-ym-pinned') !== on) row.toggleAttribute('data-ym-pinned', on);
          });
          const label = scroll.querySelector(':scope > .ym-pin-label');
          if (isDm && present > 0) {
            if (!label) scroll.append(h('div', { class: 'section-label ym-pin-label' }, 'Pinned'));
          } else if (label) label.remove();
        });
      }
      sync();
      ctx.onMutate(sync);
      ctx.on('store:change', () => { if (document.querySelector('[data-ym-dm-list]')) sync(); });
      ctx.cleanup(() => {
        document.querySelectorAll('.ym-pin-label').forEach((n) => n.remove());
        document.querySelectorAll('[data-ym-dm-list]').forEach((n) => n.removeAttribute('data-ym-dm-list'));
        document.querySelectorAll('[data-ym-pinned]').forEach((n) => n.removeAttribute('data-ym-pinned'));
        closeOwnMenu();
      });

      // ---- right-click menu -------------------------------------------------------------------------
      let ownMenu = null;
      function closeOwnMenu() {
        if (ownMenu) { ownMenu.remove(); ownMenu = null; }
      }
      const itemFor = (id, after) => h('button', { type: 'button', class: 'ym-pin-menu-item', onClick: () => { toggle(id); after(); } },
        h('span', { class: 'menu-label' }, isPinned(id) ? 'Unpin chat' : 'Pin chat'), h('span', { html: PIN_SVG }));

      function openOwnMenu(id, x, y) {
        closeOwnMenu();
        const menu = h('div', { class: 'ctx-menu', style: { left: Math.min(x, window.innerWidth - 220) + 'px', top: Math.min(y, window.innerHeight - 60) + 'px' }, onPointerDown: (e) => e.stopPropagation() }, itemFor(id, closeOwnMenu));
        ownMenu = h('div', { class: 'overlay clear ym-pin-ctx', style: { background: 'transparent', animation: 'none' }, onPointerDown: closeOwnMenu, onContextMenu: (e) => { e.preventDefault(); closeOwnMenu(); } }, menu);
        document.body.append(ownMenu);
      }

      const onContext = (e) => {
        const row = e.target instanceof Element ? e.target.closest('.chat-row[data-nav-chan]') : null;
        if (!row || !row.closest('[data-ym-dm-list]')) return;
        const id = row.getAttribute('data-nav-chan');
        const x = e.clientX;
        const y = e.clientY;
        e.preventDefault(); // no browser menu on a chat row; Yapper's own menu (when it has one) still opens
        // Yapper's menu (shown for some accounts / settings) is drawn by React just after this event: add our entry to it, or show our own.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const own = document.querySelector('.sidebar > .overlay .ctx-menu');
          if (own) {
            if (!own.querySelector('.ym-pin-menu-item')) own.prepend(itemFor(id, () => { const ov = own.closest('.overlay'); if (ov) ov.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }));
          } else openOwnMenu(id, x, y);
        }));
      };
      const onKey = (e) => { if (e.key === 'Escape') closeOwnMenu(); };
      document.addEventListener('contextmenu', onContext, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('blur', closeOwnMenu);
      ctx.cleanup(() => {
        document.removeEventListener('contextmenu', onContext, true);
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('blur', closeOwnMenu);
      });
    },
  });
})();
