'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const { net } = require('electron');

const REPOSITORY = 'Jay2ez-web/YapCord';
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const MANIFEST_URL = `https://raw.githubusercontent.com/${REPOSITORY}/main/latest.json`;
const MAX_INSTALLER_BYTES = 500 * 1024 * 1024;

function compareVersions(a, b) {
  const parse = (value) => String(value || '').replace(/^v/i, '').split(/[.+-]/)[0].split('.').map((n) => Number(n) || 0);
  const av = parse(a);
  const bv = parse(b);
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] > bv[i] ? 1 : -1;
  }
  return 0;
}

function fetchJson(url) {
  return net.fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'YapCord-updater',
    },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Update check failed with HTTP ${response.status}.`);
    return response.json();
  });
}

function downloadFile(url, destination, expectedSize) {
  return net.fetch(url, {
    headers: { Accept: 'application/octet-stream', 'User-Agent': 'YapCord-updater' },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Installer download failed with HTTP ${response.status}.`);
    const length = Number(response.headers.get('content-length') || expectedSize || 0);
    if (length > MAX_INSTALLER_BYTES) throw new Error('The update is larger than the safety limit.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_INSTALLER_BYTES) throw new Error('The update is larger than the safety limit.');
    fs.writeFileSync(destination, bytes, { mode: 0o600 });
    return bytes.length;
  });
}

class Updater extends EventEmitter {
  constructor({ currentVersion, dataDir, log }) {
    super();
    this.currentVersion = currentVersion;
    this.dataDir = dataDir;
    this.log = log;
    this.downloadDir = path.join(dataDir, 'updates');
    this.state = { state: 'idle', currentVersion, available: null, error: null };
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('state', this.snapshot());
  }

  async check() {
    if (process.platform !== 'win32' || !this.currentVersion) {
      this.setState({ state: 'unsupported', error: null });
      return this.snapshot();
    }
    this.setState({ state: 'checking', error: null });
    try {
      let manifest;
      let release = null;
      try {
        manifest = await fetchJson(MANIFEST_URL);
      } catch (manifestError) {
        // Keep compatibility with the release-asset workflow if the repository manifest is unavailable.
        release = await fetchJson(RELEASES_API);
        if (release.draft || release.prerelease) {
          this.setState({ state: 'up-to-date', available: null });
          return this.snapshot();
        }
        const manifestAsset = (release.assets || []).find((asset) => asset.name === 'latest.json');
        if (!manifestAsset) throw manifestError;
        manifest = await fetchJson(manifestAsset.browser_download_url);
      }
      const version = String(manifest.version || (release && release.tag_name) || '').replace(/^v/i, '');
      const installer = manifest.installer;
      if (!version || !installer || !installer.url || !installer.sha512) {
        throw new Error('The update manifest is incomplete.');
      }
      if (compareVersions(version, this.currentVersion) <= 0) {
        this.setState({ state: 'up-to-date', available: null });
        return this.snapshot();
      }
      this.setState({
        state: 'available',
        available: {
          version,
          notes: String((release && release.body) || manifest.notes || '').slice(0, 4000),
          url: String(installer.url),
          sha512: String(installer.sha512).toLowerCase(),
          size: Number(installer.size) || 0,
          fileName: path.basename(new URL(String(installer.url)).pathname) || `YapCord-${version}-Setup.exe`,
        },
      });
      return this.snapshot();
    } catch (error) {
      this.log.warn('update check failed:', error && error.message);
      this.setState({ state: 'error', error: error && error.message ? error.message : String(error) });
      return this.snapshot();
    }
  }

  async download() {
    const update = this.state.available;
    if (!update) throw new Error('No update is available.');
    this.setState({ state: 'downloading', error: null, progress: 0 });
    fs.mkdirSync(this.downloadDir, { recursive: true });
    const destination = path.join(this.downloadDir, `${update.version}-${update.fileName}`);
    try {
      await downloadFile(update.url, destination, update.size);
      const digest = crypto.createHash('sha512').update(fs.readFileSync(destination)).digest('hex').toLowerCase();
      if (digest !== update.sha512) {
        fs.rmSync(destination, { force: true });
        throw new Error('The downloaded update failed SHA-512 verification.');
      }
      this.setState({ state: 'ready', installerPath: destination, progress: 100 });
      return this.snapshot();
    } catch (error) {
      this.log.warn('update download failed:', error && error.message);
      this.setState({ state: 'error', error: error && error.message ? error.message : String(error) });
      throw error;
    }
  }

  install() {
    const installerPath = this.state.installerPath;
    if (this.state.state !== 'ready' || !installerPath || !fs.existsSync(installerPath)) {
      throw new Error('Download the update before installing it.');
    }
    // The explicit UI action is the consent point. NSIS /S keeps the update quiet and
    // lets the existing per-user install location be replaced after this process exits.
    spawn(installerPath, ['/S'], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
    this.setState({ state: 'installing' });
    return true;
  }
}

module.exports = { Updater, compareVersions, REPOSITORY, MANIFEST_URL };
