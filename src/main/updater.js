'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { spawn: spawnProcess } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

const REPOSITORY = 'Jay2ez-web/YapCord';
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const MANIFEST_URL = `https://raw.githubusercontent.com/${REPOSITORY}/main/latest.json`;
const MAX_INSTALLER_BYTES = 500 * 1024 * 1024;
const DOWNLOAD_HOSTS = new Set([
  'files.manuscdn.com',
  'github.com',
]);

function compareVersions(a, b) {
  const parse = (value) => {
    const match = String(value || '').trim().replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    return match ? match.slice(1).map((n) => Number(n || 0)) : [0, 0, 0];
  };
  const av = parse(a);
  const bv = parse(b);
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] > bv[i] ? 1 : -1;
  }
  return 0;
}

function safeDownloadUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch (_) {
    throw new Error('The update URL is invalid.');
  }
  const host = url.hostname.toLowerCase();
  const isGitHubAsset = host === 'github.com' || host.endsWith('.githubusercontent.com');
  if (url.protocol !== 'https:' || url.username || url.password || (!DOWNLOAD_HOSTS.has(host) && !isGitHubAsset)) {
    throw new Error('The update URL must use an approved HTTPS host.');
  }
  return url;
}

function requestSignal(timeoutMs) {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

async function fetchJson(fetchImpl, url) {
  if (typeof fetchImpl !== 'function') throw new Error('The update network service is unavailable.');
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'YapCord-updater',
    },
    signal: requestSignal(30000),
  });
  if (!response.ok) throw new Error(`Update check failed with HTTP ${response.status}.`);
  return response.json();
}

async function downloadFile(fetchImpl, url, destination, expectedSize, onProgress = () => undefined) {
  if (typeof fetchImpl !== 'function') throw new Error('The update network service is unavailable.');
  const source = safeDownloadUrl(url);
  const size = Number(expectedSize) || 0;
  if (size < 0 || size > MAX_INSTALLER_BYTES) throw new Error('The update is larger than the safety limit.');

  const response = await fetchImpl(source.href, {
    headers: { Accept: 'application/octet-stream', 'User-Agent': 'YapCord-updater' },
    signal: requestSignal(10 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`Installer download failed with HTTP ${response.status}.`);
  if (response.url) safeDownloadUrl(response.url);

  const contentLength = Number(response.headers && response.headers.get('content-length')) || 0;
  if (contentLength > MAX_INSTALLER_BYTES || (size && contentLength && contentLength !== size)) {
    throw new Error('The installer size does not match the update manifest.');
  }
  if (contentLength > 0 && contentLength > MAX_INSTALLER_BYTES) {
    throw new Error('The update is larger than the safety limit.');
  }
  if (!response.body) throw new Error('The installer download returned no data.');

  const partialPath = destination + '.partial';
  await fsp.rm(partialPath, { force: true });
  const hash = crypto.createHash('sha512');
  let bytes = 0;
  let lastPercent = -1;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_INSTALLER_BYTES) return callback(new Error('The update is larger than the safety limit.'));
      if (size && bytes > size) return callback(new Error('The installer is larger than its manifest size.'));
      hash.update(chunk);
      if (size) {
        const percent = Math.min(99, Math.floor((bytes / size) * 100));
        if (percent !== lastPercent) {
          lastPercent = percent;
          try { onProgress(percent); } catch (_) { /* progress is best-effort */ }
        }
      }
      callback(null, chunk);
    },
  });

  try {
    const body = typeof response.body.getReader === 'function' ? Readable.fromWeb(response.body) : response.body;
    await pipeline(body, meter, fs.createWriteStream(partialPath, { flags: 'wx', mode: 0o600 }));
    if (size && bytes !== size) throw new Error(`The installer size is incomplete (${bytes} of ${size} bytes).`);
    return { partialPath, bytes, sha512: hash.digest('hex').toLowerCase() };
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

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

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
    try {
      return await this.checkPromise;
    } finally {
      this.checkPromise = null;
    }
  }

  async _check() {
    this.setState({ state: 'checking', error: null, progress: null });
    try {
      let manifest;
      let release = null;
      try {
        manifest = await fetchJson(this.fetch, MANIFEST_URL + '?cache=' + Date.now());
      } catch (manifestError) {
        // Compatibility with releases that publish latest.json as a release asset.
        release = await fetchJson(this.fetch, RELEASES_API);
        if (release.draft || release.prerelease) throw manifestError;
        const manifestAsset = (release.assets || []).find((asset) => asset.name === 'latest.json');
        if (!manifestAsset) throw manifestError;
        safeDownloadUrl(manifestAsset.browser_download_url);
        manifest = await fetchJson(this.fetch, manifestAsset.browser_download_url);
      }

      const version = String(manifest.version || (release && release.tag_name) || '').replace(/^v/i, '').trim();
      const installer = manifest.installer;
      if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
        throw new Error('The update manifest contains an invalid version.');
      }
      if (!installer || !installer.url || !installer.sha512) throw new Error('The update manifest is incomplete.');
      const url = safeDownloadUrl(installer.url);
      const sha512 = String(installer.sha512).toLowerCase();
      const size = Number(installer.size);
      if (!/^[a-f0-9]{128}$/.test(sha512) || !Number.isSafeInteger(size) || size <= 0 || size > MAX_INSTALLER_BYTES) {
        throw new Error('The update manifest has an invalid installer size or SHA-512 digest.');
      }
      if (compareVersions(version, this.currentVersion) <= 0) {
        this.setState({ state: 'up-to-date', available: null, error: null, progress: null });
        return this.snapshot();
      }

      this.setState({
        state: 'available',
        available: {
          version,
          notes: String((release && release.body) || manifest.notes || '').slice(0, 4000),
          url: url.href,
          sha512,
          size,
          fileName: `YapCord-${version}-Setup.exe`,
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
    if (!update) throw new Error('No update is available.');
    this.downloadPromise = this._download(update);
    try {
      return await this.downloadPromise;
    } finally {
      this.downloadPromise = null;
    }
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
      if (result.bytes !== update.size) throw new Error('The downloaded update size failed verification.');
      if (result.sha512 !== update.sha512) throw new Error('The downloaded update failed SHA-512 verification.');
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
    if (this.state.state !== 'ready' || !installerPath || !fs.existsSync(installerPath)) {
      throw new Error('Download the update before installing it.');
    }
    if (typeof this.quit !== 'function') throw new Error('The app cannot restart into the update installer.');

    let child;
    try {
      child = this.spawn(installerPath, ['/S'], { detached: true, windowsHide: true, stdio: 'ignore' });
    } catch (error) {
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
        try {
          this.quit();
        } catch (error) {
          this.log.warn('could not close YapCord for update:', error && error.message);
        }
      }, 150);
    });
    return true;
  }
}

module.exports = {
  Updater,
  compareVersions,
  safeDownloadUrl,
  downloadFile,
  fetchJson,
  REPOSITORY,
  MANIFEST_URL,
  MAX_INSTALLER_BYTES,
};
