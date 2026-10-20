'use strict';

// The standalone YapCord 1.0 installer must not adopt or move data from a regular YapCord/Yapper profile.
// Its settings, themes, logs, and login session always live at %APPDATA%\\YapCord1.0.
const path = require('path');

const NAME = 'YapCord1.0';

function resolveDataDir(appData) {
  return {
    dir: path.join(appData, NAME),
    migrated: false,
    legacy: false,
  };
}

module.exports = { resolveDataDir, NAME };
