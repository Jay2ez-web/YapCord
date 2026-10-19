// CopyEmojiMarkdown (port): right-click a custom emoji to copy it as text (<:name:id>) or copy its picture link.
(function () {
  function markdownFor(id, emoji) {
    return '<' + (emoji && /\.gif($|\?)/i.test(emoji.path || '') ? 'a' : '') + ':' + emoji.name + ':' + id + '>';
  }

  /** Finds the stored custom emoji that belongs to a picture on screen (matched on its file path). */
  function findEmoji(img) {
    const s = YM.Store.getState();
    if (!s || !s.emojis) return null;
    const src = img.currentSrc || img.src || '';
    for (const [id, e] of Object.entries(s.emojis)) {
      if (e && e.path && src.includes(e.path)) return { id, ...e };
    }
    return null;
  }

  YM.definePlugin({
    name: 'CopyEmojiMarkdown',
    description: 'Right-click a custom emoji to copy it as <:name:id> (to use it somewhere else) or to copy the link to its picture.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Utility'],
    api: { markdownFor },
    start(ctx) {
      let menu = null;
      const close = () => { if (menu) { menu.remove(); menu = null; } };
      const copy = async (text, done) => {
        close();
        try {
          await navigator.clipboard.writeText(text);
          YM.toast(done);
        } catch (err) {
          YM.toast('Could not copy: ' + ((err && err.message) || err), { type: 'error' });
        }
      };
      const onContext = (e) => {
        const img = e.target instanceof Element ? e.target.closest('img.emoji:not(.std)') : null;
        if (!img) return;
        const emoji = findEmoji(img);
        if (!emoji) return;
        e.preventDefault();
        e.stopPropagation();
        close();
        const h = YM.dom.h;
        const x = Math.min(e.clientX, window.innerWidth - 230);
        const y = Math.min(e.clientY, window.innerHeight - 100);
        menu = h('div', { class: 'overlay clear ym-ce-menu', style: { background: 'transparent', animation: 'none', padding: 0 }, onPointerDown: close, onContextMenu: (ev) => { ev.preventDefault(); close(); } },
          h('div', { class: 'ctx-menu', role: 'menu', style: { position: 'fixed', left: x + 'px', top: y + 'px', width: '220px' }, onPointerDown: (ev) => ev.stopPropagation() },
            h('button', { type: 'button', role: 'menuitem', onClick: () => copy(markdownFor(emoji.id, emoji), 'Emoji copied') }, h('span', null, 'Copy emoji as text')),
            h('button', { type: 'button', role: 'menuitem', onClick: () => copy(img.currentSrc || img.src, 'Link copied') }, h('span', null, 'Copy picture link'))));
        document.body.append(menu);
      };
      document.addEventListener('contextmenu', onContext, true);
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey, true);
      ctx.cleanup(() => {
        document.removeEventListener('contextmenu', onContext, true);
        document.removeEventListener('keydown', onKey, true);
        close();
      });
    },
  });
})();
