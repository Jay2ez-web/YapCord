'use strict';

const crypto = require('crypto');

const APP_ID = 'dev.yapcord.app';
const INSTALLER_NAME = 'YapCord1.0.exe';
const MAX_INSTALLER_BYTES = 500 * 1024 * 1024;
const CHANNELS = new Set(['stable', 'beta', 'preview']);

function parseTag(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)(?:-(beta|preview)\.(\d+))?$/.exec(String(tag));
  if (!match) return null;
  const numbers = [Number(match[1]), Number(match[2]), Number(match[3])];
  const prereleaseNumber = match[5] === undefined ? null : Number(match[5]);
  if (!numbers.every(Number.isSafeInteger) || (prereleaseNumber !== null && !Number.isSafeInteger(prereleaseNumber))) return null;
  const channel = match[4] || 'stable';
  return {
    major: numbers[0], minor: numbers[1], patch: numbers[2], channel,
    prerelease: prereleaseNumber,
    version: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}.${match[5]}` : ''}`,
  };
}

function parseAppVersion(version) {
  return parseTag('v' + String(version));
}

function compareVersions(a, b) {
  const left = typeof a === 'string' ? parseAppVersion(a) : a;
  const right = typeof b === 'string' ? parseAppVersion(b) : b;
  if (!left || !right) throw new Error('Invalid version for comparison.');
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  if (left.channel === right.channel && left.channel !== 'stable') {
    return left.prerelease === right.prerelease ? 0 : left.prerelease < right.prerelease ? -1 : 1;
  }
  const rank = { preview: 0, beta: 1, stable: 2 };
  return rank[left.channel] === rank[right.channel] ? 0 : rank[left.channel] < rank[right.channel] ? -1 : 1;
}

function verifyManifest(manifestText, signatureText, release, expectedChannel, publicKeyPem) {
  if (typeof manifestText !== 'string' || manifestText.length > 64 * 1024) throw new Error('Update manifest is invalid or too large.');
  const encodedSignature = String(signatureText || '').trim();
  if (!/^[A-Za-z0-9+/]{86}==$/.test(encodedSignature)) throw new Error('Update signature has an invalid format.');
  const signature = Buffer.from(encodedSignature, 'base64');
  if (signature.length !== 64 || !crypto.verify(null, Buffer.from(manifestText, 'utf8'), publicKeyPem, signature)) {
    throw new Error('Update signature verification failed.');
  }

  let manifest;
  try { manifest = JSON.parse(manifestText); } catch (_) { throw new Error('Update manifest is not valid JSON.'); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Update manifest has an invalid shape.');

  const releaseTag = release && release.tag_name;
  const tagInfo = parseTag(releaseTag);
  if (!tagInfo || !CHANNELS.has(expectedChannel) || tagInfo.channel !== expectedChannel) throw new Error('Release tag does not match the selected update channel.');
  if (!!release.prerelease !== (expectedChannel !== 'stable')) throw new Error('Release prerelease flag does not match its tag.');
  if (manifest.schemaVersion !== 1 || manifest.appId !== APP_ID) throw new Error('Update manifest is for a different app or schema.');
  if (manifest.version !== tagInfo.version || manifest.channel !== expectedChannel || manifest.tag !== releaseTag) throw new Error('Update manifest version or channel does not match the release.');
  if (manifest.assetName !== INSTALLER_NAME) throw new Error('Update manifest names an unexpected installer.');
  if (!/^[a-f0-9]{64}$/.test(String(manifest.sha256 || ''))) throw new Error('Update manifest has an invalid SHA-256 digest.');
  if (!Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes < 1 || manifest.sizeBytes > MAX_INSTALLER_BYTES) throw new Error('Update installer size is invalid.');

  const asset = Array.isArray(release.assets) ? release.assets.find((item) => item && item.name === INSTALLER_NAME) : null;
  if (!asset || asset.size !== manifest.sizeBytes || typeof asset.browser_download_url !== 'string') throw new Error('The signed installer asset is missing or has a different size.');
  return { ...manifest, downloadUrl: asset.browser_download_url };
}

module.exports = { APP_ID, INSTALLER_NAME, MAX_INSTALLER_BYTES, parseTag, parseAppVersion, compareVersions, verifyManifest };
