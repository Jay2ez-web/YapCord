'use strict';
// Downloads one picture for the page without the browser's cross-origin rule (CORS), so a plugin can read an avatar's pixels
// (/petpet draws on them). Deliberately narrow: https only, only Yapper's own file hosts, no redirects, images only, size capped.

const { SITE_HOSTS } = require('./constants');

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const HOST_SUFFIXES = ['.r2.dev', '.supabase.co'];

function allowedUrl(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch (_) {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const host = u.hostname.toLowerCase();
  const ok = SITE_HOSTS.includes(host) || host === 'api.yapper.website' || HOST_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
  return ok ? u : null;
}

/**
 * @param {{ net: { fetch: Function } }} deps
 * @returns {Promise<{ type: string, data: Buffer }>}
 */
async function fetchImage({ net }, rawUrl) {
  const u = allowedUrl(rawUrl);
  if (!u) throw new Error('blocked url');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await net.fetch(u.href, { redirect: 'error', signal: ctl.signal, credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(type)) throw new Error('not a picture');
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BYTES) throw new Error('too large');
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_BYTES) throw new Error('too large');
    return { type, data };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchImage, allowedUrl, MAX_BYTES };
