'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const { APP_ID, INSTALLER_NAME, MAX_INSTALLER_BYTES, parseTag } = require('../src/main/update-protocol');

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const meter = new (require('stream').Transform)({
    transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, chunk); },
  });
  await pipeline(fs.createReadStream(filePath), meter, new (require('stream').Writable)({ write(_chunk, _encoding, callback) { callback(); } }));
  return hash.digest('hex');
}

async function main() {
  const [installerPath, tag, channel, manifestPath, signaturePath] = process.argv.slice(2);
  if (!installerPath || !tag || !channel || !manifestPath || !signaturePath) {
    fail('Usage: node tools/create-update-manifest.js <installer> <tag> <channel> <manifest-output> <signature-output>');
  }
  const tagInfo = parseTag(tag);
  if (!tagInfo || tagInfo.channel !== channel || channel !== 'stable') fail('The stable updater currently accepts only vMAJOR.MINOR.PATCH release tags.');
  if (!fs.existsSync(installerPath) || !fs.statSync(installerPath).isFile()) fail('The YapCord installer asset is missing.');
  const stats = await fsp.stat(installerPath);
  if (!Number.isSafeInteger(stats.size) || stats.size < 1 || stats.size > MAX_INSTALLER_BYTES) fail('The installer size is invalid.');

  const signingKey = process.env.YAPCORD_UPDATE_SIGNING_KEY;
  if (!signingKey) fail('The YAPCORD_UPDATE_SIGNING_KEY Actions secret is not set.');
  let privateKey;
  try { privateKey = crypto.createPrivateKey(signingKey); } catch (_) { fail('The update-signing secret is not a valid private key.'); }
  const publicKeyPath = path.join(__dirname, '..', 'src', 'main', 'update-public.pem');
  let publicKey;
  try { publicKey = crypto.createPublicKey(await fsp.readFile(publicKeyPath, 'utf8')); } catch (_) { fail('The embedded update verification key could not be loaded.'); }

  const manifest = {
    schemaVersion: 1,
    appId: APP_ID,
    version: tagInfo.version,
    channel,
    tag,
    assetName: INSTALLER_NAME,
    sizeBytes: stats.size,
    sha256: await hashFile(installerPath),
  };
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  const manifestBytes = Buffer.from(manifestText, 'utf8');
  const signature = crypto.sign(null, manifestBytes, privateKey);
  if (signature.length !== 64 || !crypto.verify(null, manifestBytes, publicKey, signature)) fail('The Actions signing key does not match the public verification key bundled in YapCord.');

  await fsp.mkdir(path.dirname(path.resolve(manifestPath)), { recursive: true });
  await fsp.mkdir(path.dirname(path.resolve(signaturePath)), { recursive: true });
  await fsp.writeFile(manifestPath, manifestText, { mode: 0o600 });
  await fsp.writeFile(signaturePath, signature.toString('base64') + '\n', { mode: 0o600 });
  console.log(`Signed ${tag} for the ${channel} channel; installer SHA-256: ${manifest.sha256}`);
}

main().catch((error) => fail(error && error.message ? error.message : 'Could not create the signed update manifest.'));
