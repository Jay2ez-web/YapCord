// Hide Attachments (native): blur photos, videos, embeds and file previews until hovered.
(function () {
  const ATTR = 'data-ym-attachment';
  const SELECTOR = "img,video,audio,iframe,[class*='attachment' i],[class*='embed' i],[class*='file-preview' i],[style*='background-image' i]";

  YM.definePlugin({
    name: 'Hide Attachments',
    description: 'Blur photos, videos, embeds, and file previews until hovered.',
    authors: ['YapCord'],
    tags: ['Chat', 'Appearance'],
    enabledByDefault: false,
    start(ctx) {
      const mark = (root) => {
        const elements = [];
        if (root.matches && root.matches(SELECTOR)) elements.push(root);
        if (root.querySelectorAll) elements.push(...root.querySelectorAll(SELECTOR));
        for (const el of elements) {
          const message = el.closest('div.msg[data-message-id],[data-message-id]');
          const inviteContext = el.closest("a[href*='/invite/' i],[data-invite],[class*='invite' i]")
            || (message && message.querySelector("a[href*='/invite/' i],[data-invite],[class*='invite' i]"));
          if (inviteContext) {
            el.removeAttribute(ATTR);
            continue;
          }
          if (el.closest(".ye-panel,.ye-launcher,nav.rail,.rail,[class*='avatar' i],[class*='profile' i],[class*='banner' i],[class*='login' i],[class*='auth' i]")
            || !message || el.hasAttribute(ATTR)) continue;
          if (!/^(IMG|VIDEO|AUDIO|IFRAME)$/.test(el.tagName) && !/attachment|embed|file-preview/i.test(el.className || '')) {
            const rect = el.getBoundingClientRect();
            if (rect.width < 80 || rect.height < 80 || getComputedStyle(el).backgroundImage === 'none') continue;
          }
          el.setAttribute(ATTR, 'true');
          el.setAttribute('title', 'Hover to reveal attachment');
        }
      };
      const scan = () => mark(document);
      scan();
      const offMut = YM.dom.onMutate(scan);
      ctx.cleanup(() => {
        try { offMut && offMut(); } catch (_) {}
        document.querySelectorAll('[' + ATTR + ']').forEach((n) => {
          n.removeAttribute(ATTR);
          if (n.getAttribute('title') === 'Hover to reveal attachment') n.removeAttribute('title');
        });
      });
      ctx.css(`
[${ATTR}]{filter:blur(14px) saturate(.8)!important;transition:filter .18s ease;cursor:pointer}
[${ATTR}]:hover{filter:none!important}
@media (prefers-reduced-motion:reduce){[${ATTR}]{transition:none}}
`);
    },
  });
})();
