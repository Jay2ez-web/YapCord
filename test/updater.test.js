'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { EventEmitter } = require('node:events');
const {
  Updater,
  compareVersions,
  safeDownloadUrl,
  downloadFile,
  MAX_INSTALLER_BYTES,
} = require('../src/main/updater');

const bytes = Buffer.from('YapCord updater test payload');
const digest = crypto.createHash('sha512').update(bytes).digest('hex');

function response(body, headers = {}) {
  return new Response(body, { status: 200, headers });
}

function manifest(version = '1.0.8') {
  return {
    version,
    installer: {
      url: 'https://files.manuscdn.com/releases/yapcord-setup.exe',
      size: bytes.length,
      sha512: digest,
    },
  };
}

async function tempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yapcord-updater-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('compares numeric version components rather than string order', () => {
  assert.equal(compareVersions('1.0.10', '1.0.7'), 1);
  assert.equal(compareVersions('1.2.0', '1.3.0'), -1);
  assert.equal(compareVersions('v1.0.7', '1.0.7'), 0);
});

test('accepts HTTPS updater hosts and rejects insecure or unapproved URLs', () => {
  assert.equal(safeDownloadUrl('https://files.manuscdn.com/setup.exe').hostname, 'files.manuscdn.com');
  assert.throws(() => safeDownloadUrl('http://files.manuscdn.com/setup.exe'), /approved HTTPS host/);
  assert.throws(() => safeDownloadUrl('https://example.invalid/setup.exe'), /approved HTTPS host/);
});

test('streams a download to a partial file and returns the measured size and SHA-512', async (t) => {
  const dir = await tempDir(t);
  const destination = path.join(dir, 'update.exe');
  const fetch = async () => response(bytes, { 'content-length': String(bytes.length) });
  const result = await downloadFile(fetch, 'https://files.manuscdn.com/setup.exe', destination, bytes.length);
  assert.equal(result.bytes, bytes.length);
  assert.equal(result.sha512, digest);
  assert.deepEqual(await fs.readFile(result.partialPath), bytes);
  assert.equal(result.partialPath, destination + '.partial');
});

test('rejects an impossible manifest size before fetching', async (t) => {
  const dir = await tempDir(t);
  let called = false;
  const fetch = async () => { called = true; return response(bytes); };
  await assert.rejects(
    downloadFile(fetch, 'https://files.manuscdn.com/setup.exe', path.join(dir, 'update.exe'), MAX_INSTALLER_BYTES + 1),
    /safety limit/,
  );
  assert.equal(called, false);
});

test('reports up-to-date when the manifest version equals the installed version', async (t) => {
  const dir = await tempDir(t);
  const fetch = async () => response(JSON.stringify(manifest('1.0.7')), { 'content-type': 'application/json' });
  const updater = new Updater({ currentVersion: '1.0.7', dataDir: dir, fetch, platform: 'win32' });
  const state = await updater.check();
  assert.equal(state.state, 'up-to-date');
  assert.equal(state.available, null);
});

test('makes a newer manifest available and verifies it before marking it ready', async (t) => {
  const dir = await tempDir(t);
  const fetch = async (url) => {
    if (String(url).startsWith('https://raw.githubusercontent.com/')) {
      return response(JSON.stringify(manifest()), { 'content-type': 'application/json' });
    }
    return response(bytes, { 'content-length': String(bytes.length) });
  };
  const updater = new Updater({ currentVersion: '1.0.7', dataDir: dir, fetch, platform: 'win32' });
  const available = await updater.check();
  assert.equal(available.state, 'available');
  assert.equal(available.available.version, '1.0.8');

  const ready = await updater.download();
  assert.equal(ready.state, 'ready');
  assert.equal(ready.progress, 100);
  assert.deepEqual(await fs.readFile(ready.installerPath), bytes);
});

test('launches the verified installer and requests app shutdown after spawn', async (t) => {
  const dir = await tempDir(t);
  const installerPath = path.join(dir, 'YapCord-1.0.8-Setup.exe');
  await fs.writeFile(installerPath, bytes);
  let quitCalled = false;
  let spawnedWith = null;
  const child = new EventEmitter();
  child.unref = () => undefined;
  const spawn = (file, args, options) => {
    spawnedWith = { file, args, options };
    setImmediate(() => child.emit('spawn'));
    return child;
  };
  const updater = new Updater({
    currentVersion: '1.0.7',
    dataDir: dir,
    platform: 'win32',
    spawn,
    quit: () => { quitCalled = true; },
  });
  updater.setState({ state: 'ready', installerPath, available: manifest().installer });
  assert.equal(updater.install(), true);
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(spawnedWith.file, installerPath);
  assert.deepEqual(spawnedWith.args, ['/S']);
  assert.equal(spawnedWith.options.detached, true);
  assert.equal(quitCalled, true);
  assert.equal(updater.state.state, 'installing');
});
