// BetterFolders (port): folder improvements for the server list.
//  - a dedicated sidebar with the servers of the open folder(s), so the main list stays short
//  - close other folders when opening one / when picking a server outside folders / when pressing the home button
//  - open a server's folder automatically (forceOpen), or close it again after picking a server in it
//
// Yapper renders an open folder inline in `nav.rail` (`.rail-folder-open`). The sidebar mirrors those servers and
// forwards clicks to the real buttons, so Yapper's own navigation, unread badges and menus keep working.

(function () {
  function rail() {
    return document.querySelector('nav.rail');
  }

  function openFolderButtons() {
    const r = rail();
    return r ? [...r.querySelectorAll('button.rail-folder.open')] : [];
  }

  let internalClick = false;
  function click(el) {
    internalClick = true;
    try {
      el.click();
    } finally {
      internalClick = false;
    }
  }

  function closeFolders(except) {
    for (const b of openFolderButtons()) {
      const row = b.closest('[data-rail-row]');
      if (except && row && row.dataset.railRow === except) continue;
      click(b);
    }
  }

  YM.definePlugin({
    name: 'BetterFolders',
    description: 'Shows the servers of an open folder in a dedicated sidebar and adds folder related improvements.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Servers', 'Appearance'],
    enabledByDefault: true,
    api: { closeFolders },
    options: {
      sidebar: { type: 'boolean', default: true, description: 'Display servers from the open folder(s) on a dedicated sidebar' },
      sidebarAnim: { type: 'boolean', default: true, description: 'Animate opening the folder sidebar' },
      keepIcons: { type: 'boolean', default: false, description: 'Keep showing the folder servers in the main list too' },
      showFolderIcon: {
        type: 'select',
        default: 'always',
        description: 'Show the folder icon above its servers in the sidebar',
        options: [
          { label: 'Never', value: 'never' },
          { label: 'Always', value: 'always' },
          { label: 'When more than one folder is open', value: 'multiple' },
        ],
      },
      closeOthers: { type: 'boolean', default: false, description: 'Close other folders when opening a folder' },
      closeAllFolders: { type: 'boolean', default: false, description: 'Close all folders when selecting a server that is not in a folder' },
      closeAllHomeButton: { type: 'boolean', default: false, description: 'Close all folders when clicking the home (direct messages) button' },
      closeServerFolder: { type: 'boolean', default: false, description: 'Close the folder when selecting a server in it' },
      forceOpen: { type: 'boolean', default: false, description: 'Open a folder when switching to a server inside it' },
    },

    start(ctx) {
      const s = ctx.settings.store;
      const h = YM.dom.h;
      let sidebar = null;
      let sidebarRail = null;
      let signature = '';
      let observedRail = null;
      let railObserver = null;
      let syncFrame = null;
      let stopped = false;

      // ---- behaviour: clicks on the rail -----------------------------------------------------
      function onClick(ev) {
        if (internalClick) return;
        const r = rail();
        const t = ev.target instanceof Element ? ev.target : null;
        if (!r || !t || !r.contains(t)) return;
        const btn = t.closest('button.rail-item');
        if (!btn) return;
        if (btn.classList.contains('rail-folder')) {
          // Opening a folder: close the others once Yapper has processed the click.
          if (s.closeOthers && !btn.classList.contains('open')) {
            const row = btn.closest('[data-rail-row]');
            const keep = row ? row.dataset.railRow : null;
            setTimeout(() => closeFolders(keep), 60);
          }
          return;
        }
        if (s.closeAllHomeButton && btn.getAttribute('title') === 'Direct messages') closeFolders();
      }
      document.addEventListener('click', onClick, true);
      ctx.cleanup(() => document.removeEventListener('click', onClick, true));

      // ---- behaviour: active server changed ---------------------------------------------------
      ctx.on('store:change', (next, prev) => {
        if (next.activeServerId === prev.activeServerId) return;
        const id = next.activeServerId;
        if (!id) return;
        const folder = YM.folders.folderOfServer(id);
        setTimeout(() => {
          const r = rail();
          if (!r) return;
          if (folder) {
            const row = r.querySelector('[data-rail-row="f:' + CSS.escape(folder.id) + '"]');
            const toggle = row && row.querySelector('button.rail-folder');
            if (!toggle) return;
            const isOpen = toggle.classList.contains('open');
            if (s.forceOpen && !isOpen) click(toggle);
            else if (s.closeServerFolder && isOpen) click(toggle);
          } else if (s.closeAllFolders) {
            closeFolders();
          }
        }, 30);
      });

      // ---- sidebar -----------------------------------------------------------------------------
      function describe() {
        const r = rail();
        if (!r || !s.sidebar) return [];
        return [...r.querySelectorAll('.rail-folder-open')].map((open) => {
          const head = open.querySelector('button.rail-folder');
          const servers = [...open.querySelectorAll('button.rail-item:not(.rail-folder)')].map((b) => {
            const wrap = b.closest('.rail-wrap');
            const badge = wrap && wrap.querySelector('.rail-badge');
            return {
              title: b.getAttribute('title') || '',
              active: b.classList.contains('active'),
              muted: b.classList.contains('muted'),
              badge: badge ? badge.textContent : '',
              dot: !!(wrap && wrap.querySelector('.rail-pill.dot')),
              html: b.innerHTML,
            };
          });
          return {
            id: open.dataset.railRow || '',
            color: open.style.getPropertyValue('--folder'),
            title: head ? head.getAttribute('title') || '' : '',
            headHtml: head ? head.innerHTML : '',
            servers,
          };
        });
      }

      function freshButton(folderId, index) {
        const r = rail();
        const open = r && [...r.querySelectorAll('.rail-folder-open')].find((o) => o.dataset.railRow === folderId);
        return open ? open.querySelectorAll('button.rail-item:not(.rail-folder)')[index] : null;
      }

      function sync() {
        if (stopped) return;
        const r = rail();
        if (!r) return;
        const folders = describe();
        document.documentElement.classList.toggle('ym-bf-hide', !!s.sidebar && !s.keepIcons && folders.length > 0);
        const sig = JSON.stringify([folders, s.showFolderIcon]);
        if (sig === signature && sidebar && sidebar.isConnected && sidebarRail === r) return;
        signature = sig;

        if (!folders.length) {
          if (sidebar) sidebar.remove();
          sidebar = null;
          sidebarRail = null;
          return;
        }
        const showIcon = s.showFolderIcon === 'always' || (s.showFolderIcon === 'multiple' && folders.length > 1);
        const fresh = h('div', { class: 'ym-bf-sidebar' + (s.sidebarAnim ? ' ym-bf-anim' : ''), 'aria-label': 'Folder servers' },
          folders.map((f) => h('div', { class: 'ym-bf-folder', style: f.color ? { '--folder': f.color } : undefined },
            showIcon ? h('button', {
              class: 'rail-item rail-folder open ym-bf-head',
              title: f.title,
              'aria-label': f.title,
              html: f.headHtml,
              onClick: () => {
                const r2 = rail();
                const open = r2 && [...r2.querySelectorAll('.rail-folder-open')].find((o) => o.dataset.railRow === f.id);
                const b = open && open.querySelector('button.rail-folder');
                if (b) click(b);
              },
            }) : null,
            f.servers.map((sv, i) => h('div', { class: 'rail-wrap' },
              h('span', { class: 'rail-pill' + (sv.active ? ' on' : sv.dot ? ' dot' : '') }),
              h('button', {
                class: 'rail-item' + (sv.active ? ' active' : '') + (sv.muted ? ' muted' : ''),
                title: sv.title,
                'aria-label': sv.title,
                html: sv.html,
                onClick: () => {
                  const b = freshButton(f.id, i);
                  if (b) b.click();
                },
                onContextMenu: (e) => {
                  const b = freshButton(f.id, i);
                  if (!b) return;
                  e.preventDefault();
                  b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY }));
                },
              }),
              sv.badge ? h('span', { class: 'rail-badge' }, sv.badge) : null)))));
        if (sidebar && sidebar.isConnected && sidebarRail === r) sidebar.replaceWith(fresh);
        else {
          if (sidebar) sidebar.remove();
          r.after(fresh);
        }
        sidebar = fresh;
        sidebarRail = r;
      }

      function queueSync() {
        if (stopped || syncFrame !== null) return;
        if (typeof requestAnimationFrame === 'function') {
          syncFrame = requestAnimationFrame(() => { syncFrame = null; sync(); });
        } else {
          syncFrame = setTimeout(() => { syncFrame = null; sync(); }, 16);
        }
      }

      function observeRail(r) {
        if (stopped || !r) return;
        if (observedRail !== r) {
          if (railObserver) railObserver.disconnect();
          observedRail = r;
          railObserver = new MutationObserver(queueSync);
          railObserver.observe(r, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'title', 'data-rail-row'],
          });
        }
        sync();
      }

      ctx.watch('nav.rail', observeRail);
      ctx.cleanup(ctx.settings.onChange(() => { signature = ''; sync(); }));
      ctx.cleanup(() => {
        stopped = true;
        if (railObserver) railObserver.disconnect();
        railObserver = null;
        observedRail = null;
        if (syncFrame !== null) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(syncFrame);
          else clearTimeout(syncFrame);
        }
        syncFrame = null;
        if (sidebar) sidebar.remove();
        sidebar = null;
        sidebarRail = null;
        document.documentElement.classList.remove('ym-bf-hide');
      });

      ctx.css(`
.ym-bf-sidebar{background:var(--bg-rail);display:flex;flex-direction:column;align-items:center;gap:8px;width:72px;flex-shrink:0;padding:12px 0;overflow-y:auto;scrollbar-width:none;border-left:1px solid var(--border)}
.ym-bf-sidebar::-webkit-scrollbar{display:none}
.ym-bf-anim{animation:ym-bf-in .2s ease}
@keyframes ym-bf-in{from{width:0;opacity:0}to{width:72px;opacity:1}}
.ym-bf-folder{display:flex;flex-direction:column;align-items:center;gap:8px;position:relative;padding:6px 0}
.ym-bf-folder:before{content:"";position:absolute;inset:0 12px;border-radius:16px;background:color-mix(in srgb,var(--folder,var(--accent)) 14%,var(--bg-elev));pointer-events:none}
.ym-bf-folder>*{position:relative}
.ym-bf-head{color:var(--folder,var(--accent))}
.ym-bf-hide .rail-folder-open>.drag-list{display:none}
.ym-bf-hide .rail-folder-open:before{display:none}
`);
      sync();
    },
  });
})();
