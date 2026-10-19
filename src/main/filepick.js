'use strict';
// A file picker that does not depend on Chromium's own <input type=file> chooser.
//
// The renderer asks for it (ym:files:pick) when Yapper calls input.click() on a file input, e.g. the "+" button next to
// the message box. We show Electron's native open dialog, read the chosen files and hand them back; the renderer then
// puts them in the input and fires "change", exactly as if the chooser had been used.

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 500 * 1024 * 1024; // per file; Yapper itself allows 100 MB at most
const MAX_FILES = 20;

// extension -> mime type (only what Yapper accepts or can show; unknown files get an empty type like in a browser)
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  svg: 'image/svg+xml', ico: 'image/x-icon', heic: 'image/heic',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', m4v: 'video/x-m4v', ogv: 'video/ogg',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', weba: 'audio/webm', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/opus',
  pdf: 'application/pdf', txt: 'text/plain', zip: 'application/zip',
};

const GROUPS = {
  'image/*': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ico', 'heic'],
  'video/*': ['mp4', 'webm', 'mov', 'mkv', 'm4v', 'ogv'],
  'audio/*': ['mp3', 'ogg', 'oga', 'wav', 'm4a', 'weba', 'flac', 'aac', 'opus'],
};

function mimeOf(fileName) {
  const ext = path.extname(String(fileName)).slice(1).toLowerCase();
  return MIME[ext] || '';
}

/** "image/png,.zip,video/*" -> ['png','zip','mp4',...] (deduplicated, plain extensions only). */
function acceptToExtensions(accept) {
  const out = new Set();
  for (const raw of String(accept || '').split(',')) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;
    if (token[0] === '.') {
      const ext = token.slice(1);
      if (/^[a-z0-9]{1,10}$/.test(ext)) out.add(ext);
    } else if (GROUPS[token]) {
      GROUPS[token].forEach((e) => out.add(e));
    } else {
      for (const [ext, mime] of Object.entries(MIME)) if (mime === token) out.add(ext);
    }
  }
  return [...out];
}

function buildFilters(accept) {
  const exts = acceptToExtensions(accept);
  const filters = [];
  if (exts.length) filters.push({ name: 'Files Yapper accepts', extensions: exts });
  filters.push({ name: 'All files', extensions: ['*'] });
  return filters;
}

/**
 * @param {{ dialog: Electron.Dialog, win: Electron.BrowserWindow|null, fsImpl?: typeof fs }} deps
 * @param {{ accept?: string, multiple?: boolean }} opts
 * @returns {Promise<Array<{name:string,type:string,lastModified:number,size:number,data?:Uint8Array,error?:string}>>}
 */
async function pickFiles({ dialog, win, fsImpl = fs }, opts = {}) {
  const multiple = !!opts.multiple;
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a file',
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: buildFilters(opts.accept),
  });
  if (res.canceled || !Array.isArray(res.filePaths) || !res.filePaths.length) return [];
  const out = [];
  for (const file of res.filePaths.slice(0, multiple ? MAX_FILES : 1)) {
    const name = path.basename(file);
    try {
      const st = fsImpl.statSync(file);
      if (!st.isFile()) continue;
      if (st.size > MAX_BYTES) {
        out.push({ name, type: mimeOf(name), lastModified: st.mtimeMs, size: st.size, error: 'too-large' });
        continue;
      }
      out.push({ name, type: mimeOf(name), lastModified: Math.round(st.mtimeMs), size: st.size, data: fsImpl.readFileSync(file) });
    } catch (err) {
      out.push({ name, type: mimeOf(name), lastModified: 0, size: 0, error: 'unreadable' });
    }
  }
  return out;
}

module.exports = { pickFiles, buildFilters, acceptToExtensions, mimeOf, MAX_BYTES, MAX_FILES };
