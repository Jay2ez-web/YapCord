'use strict';
// The app icon you chose (CustomIcons plugin): kept as a small PNG in the YapCord data folder and put on the window (taskbar) and on
// the tray icon. Switching the plugin off, or choosing "back to the original", puts the original icon back.
const fs = require('fs');
const path = require('path');

const MAX_DATA_URL = 4500000;
const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

class AppIcon {
  /**
   * @param {{ dir: string, nativeImage: typeof import('electron').nativeImage, isEnabled: () => boolean,
   *           originalWindow?: () => (Electron.NativeImage|null), log?: object }} o
   */
  constructor(o) {
    this.dir = o.dir;
    this.nativeImage = o.nativeImage;
    this.isEnabled = o.isEnabled;
    this.originalWindow = o.originalWindow || (() => null); // the icon the app uses without YapCord (for "back to the original")
    this.log = o.log || { warn() {}, error() {}, info() {} };
    this.windows = new Set();
    this.trays = new Map(); // tray -> the image the app itself gave it
  }

  get file() {
    return path.join(this.dir, 'app-icon.png');
  }

  has() {
    try {
      return fs.statSync(this.file).size > 0;
    } catch (_) {
      return false;
    }
  }

  /** The chosen picture, or null when there is none or the plugin is off. */
  custom() {
    if (!this.has() || !this.isEnabled()) return null;
    try {
      const img = this.nativeImage.createFromPath(this.file);
      return img && !img.isEmpty() ? img : null;
    } catch (_) {
      return null;
    }
  }

  /** The picture as a data URL for the settings page (also when the plugin is off), or ''. */
  previewDataUrl() {
    try {
      return 'data:image/png;base64,' + fs.readFileSync(this.file).toString('base64');
    } catch (_) {
      return '';
    }
  }

  /** @param {string} dataUrl a PNG/JPEG/WebP/GIF data URL (the settings page already made it square and small) */
  set(dataUrl) {
    if (typeof dataUrl !== 'string' || dataUrl.length > MAX_DATA_URL) throw new Error('That picture is too large.');
    const m = DATA_URL.exec(dataUrl);
    if (!m) throw new Error('That is not a picture I can use.');
    const img = this.nativeImage.createFromBuffer(Buffer.from(m[2], 'base64'));
    if (!img || img.isEmpty()) throw new Error('That is not a picture I can use.');
    const sized = img.resize({ width: 256, height: 256, quality: 'best' });
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, sized.toPNG());
    fs.renameSync(tmp, this.file);
    this.refresh();
  }

  clear() {
    try {
      fs.rmSync(this.file, { force: true });
    } catch (err) {
      this.log.warn('could not remove the app icon:', err && err.message);
    }
    this.refresh();
  }

  attachWindow(win) {
    this.windows.add(win);
    try { win.once('closed', () => this.windows.delete(win)); } catch (_) { /* mock */ }
    this._applyWindow(win);
  }

  attachTray(tray, original) {
    this.trays.set(tray, original);
    try { tray.once('destroyed', () => this.trays.delete(tray)); } catch (_) { /* older Electron */ }
    this._applyTray(tray);
  }

  _applyWindow(win) {
    try {
      if (!win || (win.isDestroyed && win.isDestroyed()) || typeof win.setIcon !== 'function') return;
      const img = this.custom() || this.originalWindow();
      if (img) win.setIcon(img);
    } catch (err) {
      this.log.warn('could not set the window icon:', err && err.message);
    }
  }

  _applyTray(tray) {
    try {
      if (tray.isDestroyed && tray.isDestroyed()) return;
      const custom = this.custom();
      const img = custom ? custom.resize({ width: 32, height: 32, quality: 'best' }) : this.trays.get(tray);
      if (img) tray.setImage(img);
    } catch (err) {
      this.log.warn('could not set the tray icon:', err && err.message);
    }
  }

  /** The tray image to start with (custom, resized) or null. */
  trayImage() {
    const c = this.custom();
    return c ? c.resize({ width: 32, height: 32, quality: 'best' }) : null;
  }

  /** Apply the current state (custom or original) to every window and tray we know. */
  refresh() {
    for (const w of [...this.windows]) this._applyWindow(w);
    for (const t of [...this.trays.keys()]) this._applyTray(t);
  }
}

module.exports = { AppIcon, DATA_URL };
