'use strict';
// Keeps the official Yapper desktop app closed while YapCord is running (both at once would be two clients on one account,
// two notification sounds, two voice connections ...). It only ever touches processes whose file name is on the user's list
// (default: Yapper.exe) and that look like Yapper's own app; it never touches YapCord itself or anything else.
//
//   1. a process on the list is first asked to close (like clicking its X);
//   2. if it is still there at the next check it is ended;
//   3. the check keeps running, so starting Yapper again closes it again within a few seconds.

const path = require('path');

const DEFAULT_NAMES = ['Yapper.exe'];
const MAX_NAMES = 5;
const INTERVAL_MS = 4000;

/** A name is only accepted when it is a plain "<something with yapper in it>.exe". This is a safety net: the list is
 *  user-editable (and reachable from the page), so it must not be usable to end arbitrary programs. */
function validName(name) {
  const n = String(name || '').trim();
  return /^[A-Za-z0-9 ._()-]{1,60}\.exe$/i.test(n) && /yapper/i.test(n) && !/yapcord/i.test(n) && !/[\\/]/.test(n);
}

function cleanNames(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const n = String(raw || '').trim();
    if (!validName(n) || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n);
    if (out.length >= MAX_NAMES) break;
  }
  return out;
}

/** "Image Name","PID",... lines from `tasklist /FO CSV /NH` -> Set of lower-case image names */
function parseTasklist(text) {
  const names = new Set();
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^"([^"]+)"/.exec(line.trim());
    if (m) names.add(m[1].toLowerCase());
  }
  return names;
}

/**
 * @param {{ execFile: Function, platform?: string, ownNames?: string[], getConfig: () => {enabled?: boolean, names?: string[]},
 *           log?: {info: Function, warn: Function}, intervalMs?: number, timers?: {setInterval: Function, clearInterval: Function} }} deps
 */
function makeRivalGuard(deps) {
  const { execFile, getConfig } = deps;
  const platform = deps.platform || process.platform;
  const log = deps.log || { info() {}, warn() {} };
  const timers = deps.timers || { setInterval, clearInterval };
  const own = new Set((deps.ownNames || []).map((n) => String(n).toLowerCase()));
  own.add(path.basename(process.execPath).toLowerCase());
  const asked = new Map(); // lower-case name -> number of checks since we asked it to close
  let timer = null;
  let running = false;
  const stats = { checks: 0, asked: 0, ended: 0 };

  const run = (file, args) =>
    new Promise((resolve) => {
      try {
        execFile(file, args, { windowsHide: true, timeout: 8000 }, (err, stdout) => resolve({ err, stdout: String(stdout || '') }));
      } catch (err) {
        resolve({ err, stdout: '' });
      }
    });

  async function check() {
    if (platform !== 'win32' || running) return;
    let cfg = {};
    try {
      cfg = getConfig() || {};
    } catch (_) {}
    if (cfg.enabled === false) {
      asked.clear();
      return;
    }
    const names = cleanNames(cfg.names && cfg.names.length ? cfg.names : DEFAULT_NAMES).filter((n) => !own.has(n.toLowerCase()));
    if (!names.length) return;
    running = true;
    try {
      stats.checks++;
      const list = await run('tasklist', ['/FO', 'CSV', '/NH']);
      if (list.err && !list.stdout) return;
      const present = parseTasklist(list.stdout);
      for (const name of names) {
        const key = name.toLowerCase();
        if (!present.has(key)) {
          asked.delete(key);
          continue;
        }
        const tries = asked.get(key) || 0;
        asked.set(key, tries + 1);
        if (tries === 0) {
          stats.asked++;
          log.info('the Yapper app (' + name + ') is open: asking it to close');
          await run('taskkill', ['/IM', name, '/T']);
        } else {
          stats.ended++;
          log.info('the Yapper app (' + name + ') did not close: ending it');
          await run('taskkill', ['/IM', name, '/T', '/F']);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    check,
    stats,
    start() {
      if (timer || platform !== 'win32') return;
      check();
      timer = timers.setInterval(check, deps.intervalMs || INTERVAL_MS);
      if (timer && typeof timer.unref === 'function') timer.unref();
    },
    stop() {
      if (timer) timers.clearInterval(timer);
      timer = null;
    },
  };
}

module.exports = { makeRivalGuard, validName, cleanNames, parseTasklist, DEFAULT_NAMES, INTERVAL_MS };
