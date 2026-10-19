'use strict';
// Inside the official Yapper app the tray icon is created by Yapper's own code. To show your own picture there, the electron module
// that Yapper's main.js is about to load gets a Tray class that starts from your picture (the same way Vencord replaces
// BrowserWindow). Yapper's code is not changed; if Electron does not allow this, the tray simply keeps Yapper's own icon.

/**
 * @param {{ icon: import('./appicon').AppIcon, log?: object, resolve?: (id: string) => string, cache?: object, electron?: object }} o
 * @returns {boolean} true when the Tray class was replaced
 */
function installTrayPatch(o) {
  const log = o.log || { warn() {}, info() {} };
  try {
    const resolve = o.resolve || ((id) => require.resolve(id));
    const cache = o.cache || require.cache;
    const electron = o.electron || require('electron');
    const entry = cache[resolve('electron')];
    if (!entry || !electron || typeof electron.Tray !== 'function') return false;
    const Original = electron.Tray;
    if (Original.__yapcord) return true;
    class YapCordTray extends Original {
      constructor(image, ...rest) {
        const custom = o.icon.trayImage();
        super(custom || image, ...rest);
        o.icon.attachTray(this, image);
      }
    }
    YapCordTray.__yapcord = true;
    // Same technique as Vencord: a copy of the module's exports with Tray replaced (the original export getters cannot be redefined).
    // The copy is made first: if reading one of Electron's exports throws, nothing has been changed yet.
    const patched = { ...electron, Tray: YapCordTray };
    delete entry.exports;
    entry.exports = patched;
    return true;
  } catch (err) {
    log.warn('could not prepare the tray icon patch:', err && err.message);
    return false;
  }
}

module.exports = { installTrayPatch };
