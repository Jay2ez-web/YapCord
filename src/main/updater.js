'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { spawn: spawnProcess } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { INSTALLER_NAME, MAX_INSTALLER_BYTES, parseTag, parseAppVersion, compareVersions, verifyManifest } = require('./update-protocol');

const REPOSITORY = 'Jay2ez-web/YapCord';
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`;
const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, 'update-public.pem'), 'utf8');
const ALLOWED_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
]);
const MAX_FEED_BYTES = 8 * 1024 * 1024;

function safeUrl(raw) {
  let url;
  try { url = new URL(String(raw)); } catch (_) { throw new Error('The update server returned an invalid URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || (url.port && url.port !== '443')) {
    throw new Error('The update server returned an untrusted HTTPS URL.');
  }
  return url;
}

function trustedReleaseAssetUrl(raw, tag, name) {
  const url = safeUrl(raw);
  const expectedPath = `/Jay2ez-web/YapCord/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
  if (url.hostname !== 'github.com' || url.pathname !== expectedPath || url.search || url.hash) {
    throw new Error('A release asset URL does not match this YapCord release.');
  }
  return url.href;
}

async function fetchResponse(fetchImpl, raw, accept, timeoutMs = 30000) {
  if (typeof fetchImpl !== 'function') throw new Error('The update network service is unavailable.');
  let url = safeUrl(raw);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetchImpl(url.href, {
      headers: { Accept: accept, 'User-Agent': 'YapCord-updater', 'Cache-Control': 'no-cache' },
      redirect: 'manual',
      signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === 5) throw new Error('Too many redirects while checking for an update.');
      const location = response.headers && response.headers.get('location');
      if (!location) throw new Error('The update server returned an invalid redirect.');
      url = safeUrl(new URL(location, url).href);
      if (response.body) await response.body.cancel().catch(() => undefined);
      continue;
    }
    if (response.url) {
      const finalUrl = safeUrl(response.url);
      if (finalUrl.href !== url.href) throw new Error('The update network request followed an unverified redirect.');
    }
    if (!response.ok) throw new Error(`Update server returned HTTP ${response.status}.`);
    return response;
  }
  throw new Error('Too many redirects while checking for an update.');
}

async function readBytes(response, maxBytes, label) {
  const length = Number(response.headers && response.headers.get('content-length')) || 0;
  if (length > maxBytes) throw new Error(`${label} is larger than allowed.`);
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error(`${label} is larger than allowed.`);
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, total);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error(`${label} is larger than allowed.`);
  return bytes;
}

async function fetchJson(fetchImpl, url, maxBytes = MAX_FEED_BYTES) {
  const response = await fetchResponse(fetchImpl, url, 'application/vnd.github+json', 30000);
  const bytes = await readBytes(response, maxBytes, 'Update response');
  try { return JSON.parse(bytes.toString('utf8')); } catch (_) { throw new Error('GitHub returned invalid release information.'); }
}

async function fetchText(fetchImpl, url, maxBytes) {
  const response = await fetchResponse(fetchImpl, url, 'application/octet-stream', 30000);
  return (await readBytes(response, maxBytes, 'Update release asset')).toString('utf8');
}

async function downloadFile(fetchImpl, url, destination, expectedSize, onProgress = () => undefined) {
  const source = safeUrl(url);
  const size = Number(expectedSize) || 0;
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_INSTALLER_BYTES) throw new Error('The update installer has an invalid size.');
  const response = await fetchResponse(fetchImpl, source.href, 'application/octet-stream', 10 * 60 * 1000);
  const contentLength = Number(response.headers && response.headers.get('content-length')) || 0;
  if (contentLength > MAX_INSTALLER_BYTES || (contentLength && contentLength !== size)) throw new Error('The installer size does not match the signed manifest.');
  if (!response.body) throw new Error('The installer download returned no data.');

  const partialPath = destination + '.partial';
  await fsp.rm(partialPath, { force: true });
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  let lastPercent = -1;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_INSTALLER_BYTES || bytes > size) return callback(new Error('The installer exceeded its signed size limit.'));
      hash.update(chunk);
      const percent = Math.min(99, Math.floor((bytes / size) * 100));
      if (percent !== lastPercent) {
        lastPercent = percent;
        try { onProgress(percent); } catch (_) { /* progress is best-effort */ }
      }
      callback(null, chunk);
    },
  });

  try {
    const body = typeof response.body.getReader === 'function' ? Readable.fromWeb(response.body) : response.body;
    await pipeline(body, meter, fs.createWriteStream(partialPath, { flags: 'wx', mode: 0o600 }));
    if (bytes !== size) throw new Error(`The installer download is incomplete (${bytes} of ${size} bytes).`);
    return { partialPath, bytes, sha256: hash.digest('hex').toLowerCase() };
  } catch (error) {
    await fsp.rm(partialPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

class Updater extends EventEmitter {
  constructor({ currentVersion, dataDir, log, fetch: fetchImpl, spawn: spawnImpl, platform, quit }) {
    super();
    this.currentVersion = currentVersion;
    this.dataDir = dataDir;
    this.log = log || { warn() {}, info() {} };
    this.fetch = fetchImpl || globalThis.fetch;
    this.spawn = spawnImpl || spawnProcess;
    this.platform = platform || process.platform;
    this.quit = quit;
    this.downloadDir = path.join(dataDir, 'updates');
    this.state = { state: 'idle', currentVersion, available: null, error: null, progress: null };
    this.checkPromise = null;
    this.downloadPromise = null;
  }

  snapshot() { return JSON.parse(JSON.stringify(this.state)); }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('state', this.snapshot());
  }

  async check() {
    if (this.platform !== 'win32' || !this.currentVersion) {
      this.setState({ state: 'unsupported', error: null });
      return this.snapshot();
    }
    if (this.checkPromise) return this.checkPromise;
    this.checkPromise = this._check();
    try { return await this.checkPromise; } finally { this.checkPromise = null; }
  }

  async _check() {
    this.setState({ state: 'checking', error: null, progress: null });
    try {
      const current = parseAppVersion(this.currentVersion);
      if (!current) throw new Error('This YapCord build has an invalid version.');
      const releases = await fetchJson(this.fetch, RELEASES_API);
      if (!Array.isArray(releases)) throw new Error('GitHub returned an unexpected release list.');
      const candidates = releases
        .map((release) => ({ release, info: release && parseTag(release.tag_name) }))
        .filter(({ release, info }) => release && !release.draft && !release.prerelease && info && info.channel === 'stable' && compareVersions(info, current) > 0)
        .sort((a, b) => compareVersions(b.info, a.info));
      if (!candidates.length) {
        this.setState({ state: 'up-to-date', available: null, error: null, progress: null });
        return this.snapshot();
      }
      const { release } = candidates[0];
      const manifestAsset = (release.assets || []).find((asset) => asset && asset.name === 'update.json');
      const signatureAsset = (release.assets || []).find((asset) => asset && asset.name === 'update.json.sig');
      const installerAsset = (release.assets || []).find((asset) => asset && asset.name === INSTALLER_NAME);
      if (!manifestAsset || !signatureAsset || !installerAsset) throw new Error('The latest release is missing its signed update files.');
      const manifestUrl = trustedReleaseAssetUrl(manifestAsset.browser_download_url, release.tag_name, manifestAsset.name);
      const signatureUrl = trustedReleaseAssetUrl(signatureAsset.browser_download_url, release.tag_name, signatureAsset.name);
      trustedReleaseAssetUrl(installerAsset.browser_download_url, release.tag_name, INSTALLER_NAME);
      const [manifestText, signatureText] = await Promise.all([
        fetchText(this.fetch, manifestUrl, 64 * 1024),
        fetchText(this.fetch, signatureUrl, 1024),
      ]);
      const manifest = verifyManifest(manifestText, signatureText, release, 'stable', PUBLIC_KEY);
      this.setState({
        state: 'available',
        available: {
          version: manifest.version,
          notes: String(release.body || '').slice(0, 4000),
          url: manifest.downloadUrl,
          sha256: manifest.sha256,
          size: manifest.sizeBytes,
          fileName: `YapCord-${manifest.version}-Setup.exe`,
        },
        error: null,
        progress: null,
      });
      return this.snapshot();
    } catch (error) {
      this.log.warn('update check failed:', error && error.message);
      this.setState({ state: 'error', error: error && error.message ? error.message : String(error), progress: null });
      return this.snapshot();
    }
  }

  async download() {
    if (this.downloadPromise) return this.downloadPromise;
    const update = this.state.available;
    if (!update) throw new Error('No verified update is available.');
    this.downloadPromise = this._download(update);
    try { return await this.downloadPromise; } finally { this.downloadPromise = null; }
  }

  async _download(update) {
    this.setState({ state: 'downloading', error: null, progress: 0 });
    const destination = path.join(this.downloadDir, update.fileName);
    let partialPath = destination + '.partial';
    try {
      await fsp.mkdir(this.downloadDir, { recursive: true });
      const result = await downloadFile(this.fetch, update.url, destination, update.size, (progress) => {
        if (this.state.state === 'downloading' && progress !== this.state.progress) this.setState({ progress });
      });
      partialPath = result.partialPath;
      if (result.bytes !== update.size || result.sha256 !== update.sha256) throw new Error('The downloaded installer failed its signed size or SHA-256 check.');
      await fsp.rm(destination, { force: true });
      await fsp.rename(partialPath, destination);
      this.setState({ state: 'ready', installerPath: destination, progress: 100, error: null });
      return this.snapshot();
    } catch (error) {
      await fsp.rm(partialPath, { force: true }).catch(() => undefined);
      this.log.warn('update download failed:', error && error.message);
      this.setState({ state: 'error', error: error && error.message ? error.message : String(error), progress: null });
      throw error;
    }
  }

  install() {
    const installerPath = this.state.installerPath;
    if (this.state.state !== 'ready' || !installerPath || !fs.existsSync(installerPath)) throw new Error('Download the update before installing it.');
    if (typeof this.quit !== 'function') throw new Error('The app cannot restart into the update installer.');
    let child;
    try { child = this.spawn(installerPath, ['/S'], { detached: true, windowsHide: true, stdio: 'ignore' }); }
    catch (error) {
      this.setState({ state: 'ready', error: `Could not start the installer: ${error.message || error}` });
      throw error;
    }
    child.once('error', (error) => {
      this.log.warn('update installer failed to launch:', error && error.message);
      this.setState({ state: 'ready', error: `Could not start the installer: ${error && error.message ? error.message : error}` });
    });
    child.once('spawn', () => {
      this.setState({ state: 'installing', error: null });
      if (typeof child.unref === 'function') child.unref();
      setTimeout(() => {
        try { this.quit(); } catch (error) { this.log.warn('could not close YapCord for update:', error && error.message); }
      }, 150);
    });
    return true;
  }
}

module.exports = { Updater, safeUrl, trustedReleaseAssetUrl, fetchResponse, readBytes, fetchJson, downloadFile, REPOSITORY, RELEASES_API, MAX_INSTALLER_BYTES };
