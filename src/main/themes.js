'use strict';
// Themes are plain .css files in <userData>/themes. A Vencord-style header comment supplies metadata:
//   /** @name My Theme  @author Me  @description ...  @version 1.0.0 */
const fs = require('fs');
const path = require('path');

const META_KEYS = [
  'name', 'author', 'description', 'version', 'license', 'source', 'website', 'invite', 'authorId', 'authorLink', 'donate', 'patreon',
];

function parseMeta(css, fileName) {
  const meta = {
    fileName,
    name: fileName.replace(/\.theme\.css$/i, '').replace(/\.css$/i, ''),
    author: 'Unknown',
    description: '',
  };
  const text = css.replace(/^﻿/, '');
  const m = text.match(/^\s*\/\*\*?([\s\S]*?)\*\//);
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const mm = line.match(/^\s*\*?\s*@(\w+)\s+(.*?)\s*$/);
      if (mm && META_KEYS.includes(mm[1])) meta[mm[1]] = mm[2];
    }
  }
  return meta;
}

function safeName(fileName) {
  if (typeof fileName !== 'string') return null;
  // Reject separators/drive letters/reserved characters ourselves: path.basename only knows the current OS's rules,
  // and a backup made on one OS may be restored on another.
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(fileName)) return null;
  const base = path.basename(fileName);
  if (!base || base !== fileName || !/\.css$/i.test(base) || base.startsWith('.')) return null;
  return base;
}

// The three themes that older versions copied (and then wrote a plain `.seeded` marker).
const LEGACY_BUNDLED = ['Amoled.theme.css', 'Compact.theme.css', 'Midnight.theme.css'];

class ThemeManager {
  constructor(dir) {
    this.dir = dir;
    this._watchers = [];
  }

  /**
   * Copies the bundled themes into the themes folder. Every bundled theme is copied once: the names already copied are
   * remembered in `.seeded.json`, so a theme the user deleted stays deleted, a theme they edited is never overwritten, and
   * themes added in a later version of the app show up for existing users too.
   */
  ensureDir(bundledDir) {
    fs.mkdirSync(this.dir, { recursive: true });
    if (!bundledDir || !fs.existsSync(bundledDir)) return;
    const listFile = path.join(this.dir, '.seeded.json');
    const oldMarker = path.join(this.dir, '.seeded'); // versions before 1.2 only knew "seeded once"
    let seeded = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(listFile, 'utf8'));
      if (Array.isArray(parsed)) seeded = parsed.filter((x) => typeof x === 'string');
    } catch (_) {
      /* first run of this version, or unreadable: start again below */
    }
    if (!seeded) seeded = fs.existsSync(oldMarker) ? LEGACY_BUNDLED.slice() : [];
    const known = new Set(seeded);
    let changed = false;
    for (const f of fs.readdirSync(bundledDir).sort()) {
      if (!/\.css$/i.test(f) || known.has(f)) continue;
      const dest = path.join(this.dir, f);
      try {
        if (!fs.existsSync(dest)) fs.copyFileSync(path.join(bundledDir, f), dest);
        known.add(f);
        changed = true;
      } catch (_) {
        /* try again next start */
      }
    }
    if (changed || !fs.existsSync(listFile)) {
      try {
        fs.writeFileSync(listFile, JSON.stringify([...known].sort(), null, 2), 'utf8');
      } catch (_) {
        /* ignore */
      }
    }
  }

  list() {
    let files = [];
    try {
      files = fs.readdirSync(this.dir).filter((f) => !!safeName(f));
    } catch (_) {
      return [];
    }
    const out = [];
    for (const f of files) {
      try {
        const css = fs.readFileSync(path.join(this.dir, f), 'utf8');
        out.push({ ...parseMeta(css, f), size: css.length });
      } catch (_) {
        /* unreadable file: skip */
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  read(fileName) {
    const safe = safeName(fileName);
    if (!safe) return '';
    try {
      return fs.readFileSync(path.join(this.dir, safe), 'utf8');
    } catch (_) {
      return '';
    }
  }

  /** Copy a user-chosen css file into the themes folder. Returns the new file name or null. */
  importFile(srcPath) {
    const base = path.basename(srcPath);
    if (!/\.css$/i.test(base)) return null;
    let dest = path.join(this.dir, base);
    let i = 1;
    while (fs.existsSync(dest)) {
      dest = path.join(this.dir, base.replace(/(\.theme)?\.css$/i, `-${i++}$&`));
    }
    fs.copyFileSync(srcPath, dest);
    return path.basename(dest);
  }

  save(fileName, css) {
    const safe = safeName(fileName);
    if (!safe || typeof css !== 'string' || css.length > 4 * 1024 * 1024) return null;
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(path.join(this.dir, safe), css, 'utf8');
    return safe;
  }

  remove(fileName) {
    const safe = safeName(fileName);
    if (!safe) return false;
    try {
      fs.unlinkSync(path.join(this.dir, safe));
      return true;
    } catch (_) {
      return false;
    }
  }

  watch(onChange) {
    this.unwatch();
    let timer = null;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 200);
    };
    try {
      this._watchers.push(fs.watch(this.dir, { persistent: false }, fire));
    } catch (_) {
      /* directory watching is a nicety only */
    }
  }

  unwatch() {
    for (const w of this._watchers) {
      try {
        w.close();
      } catch (_) {
        /* ignore */
      }
    }
    this._watchers = [];
  }
}

module.exports = { ThemeManager, parseMeta, safeName };
