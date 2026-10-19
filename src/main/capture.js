'use strict';
// Screen sharing: Electron needs an explicit handler for getDisplayMedia(). We show a small picker.
const { BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const { PICKER_HTML, PICKER_PRELOAD, ICON } = require('./constants');

function pickSource(parent, sources) {
  return new Promise((resolve) => {
    let done = false;
    const win = new BrowserWindow({
      parent: parent || undefined,
      modal: !!parent,
      width: 780,
      height: 580,
      minWidth: 520,
      minHeight: 380,
      title: 'Share your screen',
      backgroundColor: '#222329',
      autoHideMenuBar: true,
      icon: ICON,
      show: false,
      webPreferences: { preload: PICKER_PRELOAD, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    win.removeMenu();

    const finish = (value) => {
      if (done) return;
      done = true;
      ipcMain.removeListener('picker:choose', onChoose);
      try {
        if (!win.isDestroyed()) win.close();
      } catch (_) {
        /* ignore */
      }
      resolve(value);
    };
    const onChoose = (event, value) => {
      if (event.sender !== win.webContents) return;
      finish(value && typeof value.id === 'string' ? { id: value.id, audio: !!value.audio } : null);
    };
    ipcMain.on('picker:choose', onChoose);
    win.on('closed', () => finish(null));

    win.webContents.once('did-finish-load', () => {
      const payload = sources.map((s) => ({
        id: s.id,
        name: s.name,
        isScreen: s.id.startsWith('screen:'),
        thumb: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '',
        icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : '',
      }));
      win.webContents.send('picker:sources', payload);
      win.show();
    });
    win.loadFile(PICKER_HTML);
  });
}

function installDisplayMediaHandler(ses, getParent) {
  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 400, height: 225 },
          fetchWindowIcons: true,
        });
        if (!sources.length) return callback({});
        const choice = await pickSource(getParent(), sources);
        if (!choice) return callback({});
        const source = sources.find((s) => s.id === choice.id);
        if (!source) return callback({});
        const streams = { video: source };
        if (choice.audio && process.platform === 'win32') streams.audio = 'loopback';
        callback(streams);
      } catch (err) {
        console.error('[YapCord] screen share failed:', err);
        try {
          callback({});
        } catch (_) {
          /* ignore */
        }
      }
    },
    { useSystemPicker: false },
  );
}

module.exports = { installDisplayMediaHandler, pickSource };
