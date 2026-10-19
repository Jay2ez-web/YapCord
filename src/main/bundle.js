'use strict';
// Assembles every file in src/renderer (core first, then plugins) into one script that the preload
// injects into the page's main world before any Yapper script runs. No bundler needed.
const fs = require('fs');
const path = require('path');
const { RENDERER_DIR } = require('./constants');

function listFiles() {
  const core = fs
    .readdirSync(RENDERER_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => path.join(RENDERER_DIR, f));
  const pluginDir = path.join(RENDERER_DIR, 'plugins');
  let plugins = [];
  try {
    plugins = fs
      .readdirSync(pluginDir)
      .filter((f) => f.endsWith('.js'))
      .sort()
      .map((f) => path.join(pluginDir, f));
  } catch (_) {
    /* no plugins dir */
  }
  return [...core, ...plugins];
}

let cache = null;

function readSources() {
  if (cache && !process.env.YM_DEV) return cache;
  cache = listFiles().map((file) => ({
    rel: path.relative(RENDERER_DIR, file).replace(/\\/g, '/'),
    src: fs.readFileSync(file, 'utf8'),
  }));
  return cache;
}

/** @param {object} initial  state the renderer needs synchronously at boot (settings, quickCss, paths ...) */
function buildBundle(initial) {
  const out = [];
  out.push(
    "(function(){'use strict';\n" +
      "if (window.__YAPPERMOD_LOADED__) return; window.__YAPPERMOD_LOADED__ = true;\n" +
      'var YM = {}; window.YapperMod = YM; window.YapCord = YM;\n' +
      'YM.initial = ' + JSON.stringify(initial).replace(/</g, '\\u003c') + ';\n',
  );
  for (const { rel, src } of readSources()) {
    out.push(
      '\n/* ===== ' + rel + ' ===== */\n' +
        'try { (function (YM) {\n' + src + '\n})(YM); } catch (e) { console.error("[YapCord] failed to load ' + rel + '", e); }\n',
    );
  }
  // Last step, after every core file and plugin has been defined.
  out.push('\ntry { YM.bootstrap.start(); } catch (e) { console.error("[YapCord] bootstrap failed", e); }\n');
  out.push('\n})();\n//# sourceURL=yappermod://bundle.js\n');
  return out.join('');
}

module.exports = { buildBundle, listFiles };
