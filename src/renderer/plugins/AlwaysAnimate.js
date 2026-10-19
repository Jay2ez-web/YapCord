// AlwaysAnimate: force animated avatars / emojis / effects past reduce-motion and background throttling.
//
// What it does (all client-side, all safe):
//   - reports prefers-reduced-motion: no-preference so Yapper's animation gates stay open
//   - unpauses CSS animations/transitions that themes or reduce-motion rules freeze
//   - restarts videos/effects the page paused
// What it deliberately does NOT do: rewrite image URLs. Attachment and avatar CDN URLs are often
// signed, so touching query parameters breaks them ("Picture couldn't load"). v2 removed that.

(function () {
  function spoofReducedMotion() {
    try {
      const orig = window.matchMedia;
      if (typeof orig !== 'function' || orig.__ymAlwaysAnimate) return null;
      const wrapped = function (query) {
        try {
          if (typeof query === 'string' && query.toLowerCase().includes('prefers-reduced-motion')) {
            return {
              matches: false,
              media: query,
              onchange: null,
              addListener() {},
              removeListener() {},
              addEventListener() {},
              removeEventListener() {},
              dispatchEvent: () => false,
            };
          }
        } catch (_) { /* fall through */ }
        return orig.call(this, query);
      };
      wrapped.__ymAlwaysAnimate = true;
      window.matchMedia = wrapped;
      return orig;
    } catch (_) {
      return null;
    }
  }

  YM.definePlugin({
    name: 'AlwaysAnimate',
    description: 'Force animated avatars, emojis and effects to play even with reduce-motion on or the window backgrounded. Never touches image URLs, so attachments keep loading.',
    authors: ['YapCord'],
    tags: ['Appearance', 'Utility'],
    enabledByDefault: false,
    options: {
      spoofReducedMotion: { type: 'boolean', default: true, description: 'Report prefers-reduced-motion: no-preference to the page' },
      unthrottleCss: { type: 'boolean', default: true, description: 'Override animation: none / paused rules from themes and reduce-motion CSS' },
      keepVideosPlaying: { type: 'boolean', default: true, description: 'Restart videos/effects the page paused' },
    },
    start(ctx) {
      let origMatchMedia = null;
      const syncSpoof = () => {
        if (ctx.settings.store.spoofReducedMotion && !window.matchMedia.__ymAlwaysAnimate) {
          origMatchMedia = spoofReducedMotion();
        } else if (!ctx.settings.store.spoofReducedMotion && origMatchMedia && window.matchMedia.__ymAlwaysAnimate) {
          window.matchMedia = origMatchMedia;
          origMatchMedia = null;
        }
      };
      syncSpoof();
      const offSettings = ctx.settings.onChange(syncSpoof);

      // Videos / effects paused by the page: keep them playing. Images are never touched.
      const keepPlaying = () => {
        try {
          if (!ctx.settings.store.keepVideosPlaying) return;
          document.querySelectorAll('video[autoplay], video.msg-video').forEach((v) => {
            if (v.paused && v.play) v.play().catch(() => undefined);
          });
        } catch (_) { /* ignore */ }
      };
      const timer = setInterval(keepPlaying, 10000);
      // A returning tab is the main moment the page pauses media: catch it immediately.
      const onVis = () => { if (!document.hidden) keepPlaying(); };
      document.addEventListener('visibilitychange', onVis);

      const syncCss = () => document.documentElement.toggleAttribute('data-ym-always-animate', !!ctx.settings.store.unthrottleCss);
      syncCss();
      const offCss = ctx.settings.onChange(syncCss);

      ctx.cleanup(() => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVis);
        try { offSettings && offSettings(); } catch (_) {}
        try { offCss && offCss(); } catch (_) {}
        if (origMatchMedia && window.matchMedia && window.matchMedia.__ymAlwaysAnimate) {
          window.matchMedia = origMatchMedia;
        }
        document.documentElement.removeAttribute('data-ym-always-animate');
      });

      ctx.css(`
/* AlwaysAnimate: undo reduce-motion / theme freezes. Images and layout untouched. */
html[data-ym-always-animate] *, html[data-ym-always-animate] *::before, html[data-ym-always-animate] *::after {
  animation-play-state: running !important;
}
html[data-ym-always-animate] .typing-dots i { animation: revert !important; opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  html[data-ym-always-animate] *, html[data-ym-always-animate] *::before, html[data-ym-always-animate] *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: infinite !important;
    transition-duration: 0.01ms !important;
  }
}
`);
      keepPlaying();
    },
  });
})();
