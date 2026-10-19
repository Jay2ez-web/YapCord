'use strict';
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = {
  ROOT,
  SITE_URL: 'https://www.yapper.website/',
  // Hosts the app window is allowed to navigate to. Everything else opens in the system browser.
  SITE_HOSTS: ['yapper.website', 'www.yapper.website'],
  // Hosts that count as "Yapper" for permission grants (microphone, notifications, screen capture).
  TRUSTED_HOSTS: ['yapper.website', 'www.yapper.website', 'api.yapper.website'],
  RENDERER_DIR: path.join(ROOT, 'src', 'renderer'),
  PRELOAD: path.join(ROOT, 'src', 'preload', 'index.js'),
  PICKER_HTML: path.join(ROOT, 'src', 'main', 'picker', 'picker.html'),
  PICKER_PRELOAD: path.join(ROOT, 'src', 'main', 'picker', 'picker-preload.js'),
  BUNDLED_THEMES_DIR: path.join(ROOT, 'themes'),
  ICON: path.join(ROOT, 'build', 'icon.png'),
};
