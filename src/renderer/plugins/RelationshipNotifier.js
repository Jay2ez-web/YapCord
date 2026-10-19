// RelationshipNotifier (port): tells you when someone is no longer in your friends list, or an incoming request disappears.
(function () {
  /** previous and next friends map -> list of { id, kind } (kind: 'removed' | 'request-gone') */
  function diff(prev, next) {
    const out = [];
    for (const [id, status] of Object.entries(prev || {})) {
      if (next && next[id]) continue;
      if (status === 'accepted') out.push({ id, kind: 'removed' });
      else if (status === 'incoming') out.push({ id, kind: 'request-gone' });
    }
    return out;
  }

  YM.definePlugin({
    name: 'RelationshipNotifier',
    description: 'Shows a message when someone disappears from your friends list (they removed you, or you did on another device).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Friends', 'Notifications'],
    api: { diff },
    options: {
      requests: { type: 'boolean', default: false, description: 'Also tell me when an incoming friend request is withdrawn' },
    },
    start(ctx) {
      let loaded = Object.keys((YM.Store.getState() || {}).friends || {}).length > 0; // plugin switched on later: the list is already there
      let quiet = 0;
      const name = (id) => YM.Store.displayName(id);
      // Removing a friend yourself (the buttons in Yapper) is not news: stay quiet for a moment after a click on a friend button.
      const onClick = (e) => {
        if (e.target instanceof Element && e.target.closest('.people-row,.pc2,.profile-card,.modal,.ctx-menu')) quiet = Date.now() + 4000;
      };
      document.addEventListener('click', onClick, true);
      ctx.cleanup(() => document.removeEventListener('click', onClick, true));
      ctx.on('store:change', (s, p) => {
        if (s.friends === p.friends) return;
        // The first fill of the list (after login) is not a change.
        if (!loaded) { if (Object.keys(s.friends || {}).length || Object.keys(p.friends || {}).length) loaded = true; return; }
        if (Date.now() < quiet) return;
        for (const ev of diff(p.friends, s.friends)) {
          if (ev.kind === 'request-gone' && !ctx.settings.store.requests) continue;
          YM.toast(ev.kind === 'removed' ? name(ev.id) + ' is no longer in your friends list.' : name(ev.id) + ' withdrew their friend request.', { duration: 8000 });
        }
      });
    },
  });
})();
