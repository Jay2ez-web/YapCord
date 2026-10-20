'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const { Transform, Writable } = require('stream');
const { INSTALLER_NAME, MAX_INSTALLER_BYTES, parseTag, verifyManifest } = require('../src/main/update-protocol');

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const meter = new Transform({ transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, chunk); } });
  await pipeline(fs.createReadStream(filePath), meter, new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
  return hash.digest('hex');
}

async function main() {
  const [installerPath, manifestPath, signaturePath, tag, channel] = process.argv.slice(2);
  if (!installerPath || !manifestPath || !signaturePath || !tag || !channel) {
    fail('Usage: node tools/verify-update-manifest.js <installer> <manifest> <signature> <tag> <channel>');
  }
  const tagInfo = parseTag(tag);
  if (!tagInfo || tagInfo.channel !== channel || channel !== 'stable') fail('The stable updater accepts only stable vMAJOR.MINOR.PATCH release tags.');
  let stats;
  try { stats = await fsp.stat(installerPath); } catch (_) { fail('The YapCord installer asset is missing.'); }
  if (!stats.isFile() || !Number.isSafeInteger(stats.size) || stats.size < 1 || stats.size > MAX_INSTALLER_BYTES) fail('The installer size is invalid.');

  let manifestText;
  let signatureText;
  try {
    manifestText = await fsp.readFile(manifestPath, 'utf8');
    signatureText = await fsp.readFile(signaturePath, 'utf8');
  } catch (_) { fail('Could not read the update manifest or signature.'); }
  let publicKey;
  try { publicKey = await fsp.readFile(path.join(__dirname, '..', 'src', 'main', 'update-public.pem'), 'utf8'); }
  catch (_) { fail('The embedded update verification key could not be loaded.'); }

  const assetUrl = `https://github.com/Jay2ez-web/YapCord/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(INSTALLER_NAME)}`;
  const release = { tag_name: tag, prerelease: false, assets: [{ name: INSTALLER_NAME, size: stats.size, browser_download_url: assetUrl }] };
  let manifest;
  try { manifest = verifyManifest(manifestText, signatureText, release, channel, publicKey); }
  catch (error) { fail(error && error.message ? error.message : 'Manifest verification failed.'); }
  if (manifest.sha256 !== await hashFile(installerPath)) fail('The installer does not match the signed SHA-256 digest.');
  console.log(`Verified signed YapCord ${manifest.version} ${channel} release assets.`);
}

main().catch((error) => fail(error && error.message ? error.message : 'Could not verify signed release assets.'));
