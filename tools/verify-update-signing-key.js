'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const secret = process.env.YAPCORD_UPDATE_SIGNING_KEY;
if (!secret) {
  console.error('The YAPCORD_UPDATE_SIGNING_KEY Actions secret is not set.');
  process.exit(1);
}
try {
  const privateKey = crypto.createPrivateKey(secret);
  const derived = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const embedded = crypto.createPublicKey(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'update-public.pem'), 'utf8'))
    .export({ type: 'spki', format: 'der' });
  if (!derived.equals(embedded)) throw new Error('mismatch');
} catch (_) {
  console.error('The update-signing secret is invalid or does not match the public key embedded in this release.');
  process.exit(1);
}
console.log('The signing secret matches the YapCord embedded verification key.');
