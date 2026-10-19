'use strict';
// A small zip reader (stored and deflate entries; no zip64, no encryption), enough for GitHub's zip downloads. Used by the updater.
// It is deliberately strict: it never writes outside the target folder, ignores links, only extracts the names it is allowed to,
// and stops at size limits, because the input comes from the internet.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

class ZipError extends Error {}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @returns {{ name: string, method: number, crc: number, csize: number, usize: number, offset: number, dir: boolean, link: boolean }[]} */
function readEntries(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ZipError('That is not a zip file.');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('That is not a zip file.');
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError('Zip64 files are not supported.');
  if (cdOffset + cdSize > buf.length) throw new ZipError('The zip file is damaged.');
  const out = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError('The zip file is damaged.');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const externalAttr = buf.readUInt32LE(p + 38);
    const offset = buf.readUInt32LE(p + 42);
    if (flags & 1) throw new ZipError('Encrypted zip files are not supported.');
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const unixMode = externalAttr >>> 16;
    out.push({ name, method, crc, csize, usize, offset, dir: name.endsWith('/'), link: (unixMode & 0o170000) === 0o120000 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Turns an entry name into a safe relative path (array of segments), or null when it must be skipped. Throws on path tricks. */
function safeSegments(name) {
  if (name.includes('\0')) throw new ZipError('The zip file contains an invalid name.');
  const parts = name.replace(/\\/g, '/').split('/').filter((s) => s !== '' && s !== '.');
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new ZipError('The zip file contains an absolute path.');
  if (parts.some((s) => s === '..')) throw new ZipError('The zip file contains a path that leaves its folder.');
  return parts;
}

/**
 * Extracts `buf` into `destDir`.
 * @param {{ stripRoot?: boolean, allow?: string[], maxFiles?: number, maxTotal?: number, maxEntry?: number }} [opt]
 *   stripRoot: all files live in one top folder (as in GitHub downloads): drop it.  allow: only these top-level names are written.
 * @returns {{ files: number, bytes: number }}
 */
function extractZip(buf, destDir, opt = {}) {
  const maxFiles = opt.maxFiles || 3000;
  const maxTotal = opt.maxTotal || 60 * 1024 * 1024;
  const maxEntry = opt.maxEntry || 30 * 1024 * 1024;
  const all = readEntries(buf);
  if (all.length > maxFiles * 2) throw new ZipError('The zip file has too many entries.');
  const files = all.filter((e) => !e.dir && !e.link);
  let root = null;
  if (opt.stripRoot) {
    const firsts = new Set(files.map((e) => safeSegments(e.name)[0]));
    if (firsts.size !== 1) throw new ZipError('The zip file does not have the expected layout.');
    root = [...firsts][0];
  }
  const dest = path.resolve(destDir);
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  let bytes = 0;
  for (const e of files) {
    let parts = safeSegments(e.name);
    if (root !== null) parts = parts.slice(1);
    if (!parts.length) continue;
    if (opt.allow && !opt.allow.includes(parts[0])) continue;
    if (++count > maxFiles) throw new ZipError('The zip file has too many files.');
    if (e.usize > maxEntry) throw new ZipError('The zip file contains a file that is too large.');
    if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new ZipError('The zip file is damaged.');
    const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
    if (start + e.csize > buf.length) throw new ZipError('The zip file is damaged.');
    const raw = buf.subarray(start, start + e.csize);
    let data;
    if (e.method === 0) data = raw;
    else if (e.method === 8) {
      try {
        data = zlib.inflateRawSync(raw, { maxOutputLength: e.usize + 1 });
      } catch (_) {
        throw new ZipError('The zip file is damaged.');
      }
    } else throw new ZipError('The zip file uses an unsupported compression.');
    if (data.length !== e.usize || crc32(data) !== e.crc) throw new ZipError('The zip file is damaged (checksum).');
    bytes += data.length;
    if (bytes > maxTotal) throw new ZipError('The zip file is too large when unpacked.');
    const target = path.resolve(dest, ...parts);
    if (target !== dest && !target.startsWith(dest + path.sep)) throw new ZipError('The zip file contains a path that leaves its folder.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  return { files: count, bytes };
}

module.exports = { extractZip, readEntries, crc32, safeSegments, ZipError };
