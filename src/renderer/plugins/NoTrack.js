// NoTrack (port): blocks analytics and error-tracking. In the app this is enforced for *every* request by the main
// process (see src/main/netfilter.js); this plugin adds the same rules inside the page (fetch / sendBeacon) so it also
// works when the runtime is used outside the app, and shows what was blocked.

(function () {
  const DOMAINS = [
    'sentry.io', 'sentry-cdn.com', 'google-analytics.com', 'analytics.google.com', 'googletagmanager.com',
    'doubleclick.net', 'googlesyndication.com', 'hotjar.com', 'hotjar.io', 'mixpanel.com', 'segment.io', 'segment.com',
    'amplitude.com', 'posthog.com', 'plausible.io', 'clarity.ms', 'fullstory.com', 'logrocket.com', 'logrocket.io',
    'datadoghq.com', 'bugsnag.com', 'newrelic.com', 'nr-data.net', 'cloudflareinsights.com', 'vitals.vercel-insights.com',
    'va.vercel-scripts.com', 'connect.facebook.net', 'facebook.net', 'statcounter.com', 'heap.io', 'heapanalytics.com',
  ];
  const PATHS = ['/_vercel/insights/', '/_vercel/speed-insights/', '/va/'];
  const PATH_RE = /^\/[0-9a-f]{16}\/(script\.js|view|event|session|vitals|identify|group)$/i;

  function isTracker(url) {
    let u;
    try {
      u = new URL(String(url), location.href);
    } catch (_) {
      return false;
    }
    const host = u.hostname.toLowerCase();
    if (/(^|\.)yapper\.website$/.test(host)) return PATHS.some((p) => u.pathname.startsWith(p)) || PATH_RE.test(u.pathname);
    if (/(^|\.)(supabase\.co|livekit\.cloud|cloudflare\.com)$/.test(host) && !/cloudflareinsights/.test(host)) return false;
    return DOMAINS.some((d) => host === d || host.endsWith('.' + d));
  }

  const blocked = { count: 0, recent: [] };
  function record(url) {
    blocked.count++;
    try {
      const u = new URL(String(url), location.href);
      blocked.recent.unshift(u.hostname + u.pathname.slice(0, 40));
      if (blocked.recent.length > 15) blocked.recent.length = 15;
    } catch (_) { /* ignore */ }
  }

  const plugin = YM.definePlugin({
    name: 'NoTrack',
    description: 'Blocks analytics and tracking requests (Vercel Analytics, Sentry, Google Analytics, ...).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Privacy'],
    enabledByDefault: true,
    options: {
      stats: {
        type: 'custom',
        render(container) {
          const h = YM.dom.h;
          const out = h('div', { class: 'ym-hint' }, 'Loading...');
          container.append(out);
          (async () => {
            let appBlocked = 0;
            let recent = blocked.recent.slice();
            try {
              const info = await YM.native.app.info();
              if (info && info.netfilter) {
                appBlocked = info.netfilter.blocked || 0;
                recent = (info.netfilter.recent || []).concat(recent);
              }
            } catch (_) { /* outside the app */ }
            out.textContent = `Blocked this session: ${appBlocked + blocked.count}` + (recent.length ? ` (latest: ${recent.slice(0, 3).join(', ')})` : '');
          })();
        },
      },
    },
    api: { isTracker, blocked },

    start(ctx) {
      ctx.cleanup(YM.net.onFetch({
        test: (url) => isTracker(url),
        before(c) {
          record(c.url);
          c.cancel = true;
        },
      }));
      const nativeBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
      if (nativeBeacon) {
        navigator.sendBeacon = function (url, data) {
          if (isTracker(url)) {
            record(url);
            return true; // pretend it was queued
          }
          return nativeBeacon(url, data);
        };
        ctx.cleanup(() => { navigator.sendBeacon = nativeBeacon; });
      }
      // Drop tracker <script> tags that are added after we start (the ones in the initial HTML are blocked by the app).
      ctx.watch('script[src]', (el) => {
        if (isTracker(el.src)) {
          record(el.src);
          el.remove();
        }
      });
    },
  });
  void plugin;
})();
