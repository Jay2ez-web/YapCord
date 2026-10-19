'use strict';
// This YapCord 1.0 side-by-side build keeps its settings and login session at %APPDATA%\YapCord1.0.
// The app used to be called YapperMod and kept everything in %APPDATA%\YapperMod. On the first start under the new name that
// folder is renamed, so settings, themes and the login session survive. If the rename is not possible (for example because the
// old app is still running), the old folder is simply used for this run and the rename is tried again next time.
const fs = require('fs');
const path = require('path');

const NAME = 'YapCord1.0';
const OLD_NAME = 'YapCord1.0';

/** @returns {{ dir: string, migrated: boolean, legacy: boolean, error?: Error }} */
function resolveDataDir(appData, fsImpl = fs) {
  const next = path.join(appData, NAME);
  const old = path.join(appData, OLD_NAME);
  if (fsImpl.existsSync(next) || !fsImpl.existsSync(old)) return { dir: next, migrated: false, legacy: false };
  try {
    fsImpl.renameSync(old, next);
    return { dir: next, migrated: true, legacy: false };
  } catch (error) {
    return { dir: old, migrated: false, legacy: true, error };
  }
}

module.exports = { resolveDataDir, NAME, OLD_NAME };
