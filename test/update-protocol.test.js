'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const {
  APP_ID, INSTALLER_NAME, parseTag, parseAppVersion, compareVersions, verifyManifest,
} = require('../src/main/update-protocol');
const { resolveDataDir } = require('../src/main/datadir');
const { safeUrl, trustedReleaseAssetUrl, fetchResponse, readBytes } = require('../src/main/updater');

const releaseUrl = (tag, name) => `https://github.com/Jay2ez-web/YapCord/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;

test('release tags and versions are strict and correctly ordered', () => {
  assert.equal(parseTag('v1.0.8').version, '1.0.8');
  assert.equal(parseTag('v1.0.8-beta.2').channel, 'beta');
  assert.equal(parseTag('v1.0.8-preview.1').channel, 'preview');
  assert.equal(parseTag('v1.0.8-extra'), null);
  assert.equal(parseAppVersion('1.0.8').version, '1.0.8');
  assert.equal(compareVersions('1.0.8', '1.0.7'), 1);
  assert.equal(compareVersions('1.0.8-beta.2', '1.0.8-beta.1'), 1);
  assert.throws(() => compareVersions('not-a-version', '1.0.0'));
});

test('only the embedded Ed25519 key can authenticate the exact release manifest', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const tag = 'v1.0.8';
  const bytes = Buffer.from('installer bytes');
  const manifest = {
    schemaVersion: 1,
    appId: APP_ID,
    version: '1.0.8',
    channel: 'stable',
    tag,
    assetName: INSTALLER_NAME,
    sizeBytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
  const text = JSON.stringify(manifest, null, 2) + '\n';
  const signature = crypto.sign(null, Buffer.from(text, 'utf8'), privateKey).toString('base64');
  const release = {
    tag_name: tag,
    prerelease: false,
    body: 'Test release',
    assets: [{ name: INSTALLER_NAME, size: bytes.length, browser_download_url: releaseUrl(tag, INSTALLER_NAME) }],
  };
  const verified = verifyManifest(text, signature, release, 'stable', publicKey);
  assert.equal(verified.sha256, manifest.sha256);
  assert.equal(verified.downloadUrl, release.assets[0].browser_download_url);
  assert.throws(() => verifyManifest(text + ' ', signature, release, 'stable', publicKey), /signature/i);
  assert.throws(() => verifyManifest(text, signature, { ...release, tag_name: 'v1.0.9' }, 'stable', publicKey), /signature|version|tag/i);
  assert.throws(() => verifyManifest(text, signature, { ...release, prerelease: true }, 'stable', publicKey), /prerelease/i);
});

test('asset URLs are HTTPS, repository-scoped, and cannot change release or asset', () => {
  const tag = 'v1.0.8';
  assert.equal(trustedReleaseAssetUrl(releaseUrl(tag, INSTALLER_NAME), tag, INSTALLER_NAME), releaseUrl(tag, INSTALLER_NAME));
  assert.throws(() => safeUrl('http://github.com/Jay2ez-web/YapCord/releases/download/v1.0.8/YapCord1.0.exe'), /untrusted|HTTPS/i);
  assert.throws(() => trustedReleaseAssetUrl('https://attacker.invalid/file.exe', tag, INSTALLER_NAME), /untrusted|match/i);
  assert.throws(() => trustedReleaseAssetUrl(releaseUrl('v1.0.7', INSTALLER_NAME), tag, INSTALLER_NAME), /match/i);
  assert.throws(() => trustedReleaseAssetUrl(releaseUrl(tag, 'other.exe'), tag, INSTALLER_NAME), /match/i);
});

test('redirects are revalidated before the updater makes another request', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push(url);
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
  };
  await assert.rejects(fetchResponse(fetchImpl, 'https://api.github.com/repos/Jay2ez-web/YapCord/releases', 'application/json'), /untrusted HTTPS/i);
  assert.equal(requests.length, 1);
});

test('update metadata body size is enforced while streaming, even if its length header lies', async () => {
  const response = new Response('oversized', { headers: { 'content-length': '1' } });
  await assert.rejects(readBytes(response, 4, 'test metadata'), /larger than allowed/i);
});

test('standalone data stays in its own profile instead of adopting regular YapCord data', () => {
  const appData = path.resolve('profile-test', 'appdata');
  const result = resolveDataDir(appData);
  assert.equal(result.dir, path.join(appData, 'YapCord1.0'));
  assert.notEqual(result.dir, path.join(appData, 'YapCord'));
  assert.equal(result.migrated, false);
  assert.equal(result.legacy, false);
});
