// NoPendingCount (port): no red numbers for incoming friend requests.
(function () {
  YM.definePlugin({
    name: 'NoPendingCount',
    description: 'Removes the number of incoming friend requests from the Friends tab, the chat list and the Home button in the server list.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Friends', 'Notifications'],
    start(ctx) {
      ctx.css(`
.friends-tabs button .badge,.sidebar .chat-row.nav .badge{display:none!important}
.rail-badge[data-ym-nopending]{display:none!important}
`);
      // The Home badge adds unread chats and friend requests into one number: take the requests off again.
      const sync = () => {
        const s = YM.Store.getState();
        const badge = document.querySelector('nav.rail > .rail-wrap:first-child > .rail-badge');
        if (!s || !badge) return;
        const incoming = Object.values(s.friends || {}).filter((x) => x === 'incoming').length;
        const shown = parseInt(badge.textContent, 10);
        if (!incoming || !Number.isFinite(shown)) { badge.removeAttribute('data-ym-nopending'); return; }
        if (badge.hasAttribute('data-ym-orig') && badge.getAttribute('data-ym-orig') === badge.textContent) return;
        const left = shown - incoming;
        if (left <= 0) badge.setAttribute('data-ym-nopending', '');
        else {
          badge.removeAttribute('data-ym-nopending');
          badge.setAttribute('data-ym-orig', String(left));
          badge.textContent = String(left);
        }
      };
      ctx.onMutate(sync);
      ctx.on('store:change', (s, p) => { if (s.friends !== p.friends) sync(); });
      sync();
      ctx.cleanup(() => document.querySelectorAll('[data-ym-nopending],[data-ym-orig]').forEach((n) => { n.removeAttribute('data-ym-nopending'); n.removeAttribute('data-ym-orig'); }));
    },
  });
})();
