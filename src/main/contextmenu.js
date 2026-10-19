'use strict';
// Right-click menu for the page: spelling suggestions, link and image address, "search the web" (SearchContextMenu plugin),
// cut/copy/paste. Used by the YapCord window and when YapCord runs inside the official Yapper app.
const { Menu, clipboard } = require('electron');
const { searchItems } = require('./search');
const log = require('./log');

/**
 * @param {Electron.WebContents} wc
 * @param {{ getWindow: () => Electron.BrowserWindow|null, settings: import('./settings').SettingsStore, openExternal: (url: string) => void }} deps
 */
function attachContextMenu(wc, { getWindow, settings, openExternal }) {
  wc.on('context-menu', (_e, params) => {
    const items = [];
    if (params.misspelledWord) {
      for (const s of params.dictionarySuggestions.slice(0, 5)) {
        items.push({ label: s, click: () => wc.replaceMisspelling(s) });
      }
      if (items.length) items.push({ type: 'separator' });
    }
    if (params.linkURL) {
      items.push({ label: 'Open link in browser', click: () => openExternal(params.linkURL) });
      items.push({ label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) });
    }
    if (params.mediaType === 'image' && params.srcURL) {
      items.push({ label: 'Copy image address', click: () => clipboard.writeText(params.srcURL) });
    }
    try {
      const found = searchItems(params, (settings.get().plugins || {}).SearchContextMenu);
      if (found.length && items.length) items.push({ type: 'separator' });
      for (const f of found) items.push({ label: f.label, click: () => openExternal(f.url) });
    } catch (err) {
      log.warn('search menu failed:', err && err.message);
    }
    if (params.isEditable) {
      items.push({ role: 'cut', enabled: params.editFlags.canCut }, { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste }, { role: 'selectAll' });
    } else if (params.selectionText) {
      items.push({ role: 'copy' });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: getWindow() || undefined });
  });
}

module.exports = { attachContextMenu };
