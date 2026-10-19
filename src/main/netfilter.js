'use strict';
// Network-level protections: NoTrack blocklist and (optional) CSP removal so the injected runtime can always run.
const { TRUSTED_HOSTS } = require('./constants');

// Domains (and all their subdomains) that only exist to collect telemetry / analytics.
const BLOCKED_DOMAINS = [
  'sentry.io', 'sentry-cdn.com', 'ingest.sentry.io',
  'google-analytics.com', 'analytics.google.com', 'googletagmanager.com', 'googletagservices.com',
  'doubleclick.net', 'googlesyndication.com', 'adservice.google.com',
  'hotjar.com', 'hotjar.io', 'mixpanel.com', 'segment.io', 'segment.com', 'amplitude.com',
  'posthog.com', 'plausible.io', 'clarity.ms', 'fullstory.com', 'logrocket.com', 'logrocket.io',
  'datadoghq.com', 'browser-intake-datadoghq.com', 'bugsnag.com', 'newrelic.com', 'nr-data.net',
  'static.cloudflareinsights.com', 'cloudflareinsights.com',
  'vitals.vercel-insights.com', 'va.vercel-scripts.com', 'vercel.live',
  'connect.facebook.net', 'facebook.net', 'ads-twitter.com', 'analytics.twitter.com', 'tiktok-analytics.com',
  'statcounter.com', 'matomo.cloud', 'heap.io', 'heapanalytics.com', 'smartlook.com', 'mouseflow.com',
];

// Path fragments that are telemetry even on a first-party host (Vercel Web Analytics / Speed Insights).
const BLOCKED_PATHS = ['/_vercel/insights/', '/_vercel/speed-insights/', '/va/'];
// Yapper serves Vercel Analytics / Speed Insights from obfuscated first-party paths, e.g.
//   /733e0a8345b9f6e4/script.js  /733e0a8345b9f6e4/view|event|session   /baf2ce63e079444d/script.js
const BLOCKED_PATH_PATTERNS = [/^\/[0-9a-f]{16}\/(script\.js|view|event|session|vitals|identify|group)$/i];

// Never block these, even if a rule above would match (login captcha etc).
const ALLOWED_DOMAINS = ['challenges.cloudflare.com', 'yapper.website', 'supabase.co', 'supabase.in', 'livekit.cloud'];

function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

function shouldBlock(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch (_) {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:' && u.protocol !== 'wss:' && u.protocol !== 'ws:') return false;
  const host = u.hostname.toLowerCase();
  if (ALLOWED_DOMAINS.some((d) => hostMatches(host, d))) {
    // first-party analytics paths are still blocked
    return BLOCKED_PATHS.some((p) => u.pathname.startsWith(p)) || BLOCKED_PATH_PATTERNS.some((re) => re.test(u.pathname));
  }
  return BLOCKED_DOMAINS.some((d) => hostMatches(host, d));
}

class NetFilter {
  constructor() {
    this.enabled = true;
    this.blockedCount = 0;
    this.recent = [];
  }

  install(ses) {
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
      // Images, video and fonts are never blocked: over-blocking here is exactly
      // what makes avatars/attachments vanish while the rest of the app works.
      const rt = details.resourceType;
      if (this.enabled && rt !== 'image' && rt !== 'media' && rt !== 'font' && shouldBlock(details.url)) {
        this.blockedCount++;
        try {
          const u = new URL(details.url);
          this.recent.unshift(u.hostname + u.pathname.slice(0, 40));
          if (this.recent.length > 25) this.recent.length = 25;
        } catch (_) {
          /* ignore */
        }
        callback({ cancel: true });
        return;
      }
      callback({});
    });

    // Strip Content-Security-Policy on Yapper pages. Yapper currently sends none; if that changes, the
    // runtime (which patches modules) must keep working. Other hosts are left untouched.
    ses.webRequest.onHeadersReceived({ urls: ['https://*.yapper.website/*', 'https://yapper.website/*'] }, (details, callback) => {
      const headers = details.responseHeaders || {};
      for (const k of Object.keys(headers)) {
        if (/^content-security-policy(-report-only)?$/i.test(k)) delete headers[k];
      }
      callback({ responseHeaders: headers });
    });
  }

  stats() {
    return { enabled: this.enabled, blocked: this.blockedCount, recent: this.recent.slice() };
  }
}

module.exports = { NetFilter, shouldBlock, BLOCKED_DOMAINS, BLOCKED_PATHS, BLOCKED_PATH_PATTERNS, TRUSTED_HOSTS };
