'use strict';
const fs = require('fs');
const path = require('path');

let file = null;
const MAX = 1024 * 1024;

function init(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, 'main.log');
    try {
      if (fs.statSync(file).size > MAX) fs.renameSync(file, file + '.old');
    } catch (_) {
      /* no previous log */
    }
  } catch (_) {
    file = null;
  }
}

function write(level, args) {
  const line =
    new Date().toISOString() + ' [' + level + '] ' +
    args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
  try {
    (level === 'error' ? console.error : console.log)(line.trimEnd());
  } catch (_) {
    /* ignore */
  }
  if (file) {
    try {
      fs.appendFileSync(file, line);
    } catch (_) {
      /* ignore */
    }
  }
}

module.exports = {
  init,
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
  get file() {
    return file;
  },
};
