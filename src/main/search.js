'use strict';
// Extra right-click entries: "Search the web for ..." for selected text and "Search image with ..." for pictures.
// The plugin settings (plugins.SearchContextMenu) are read live from the settings store, so toggling it in the UI works at once.

const TEXT_ENGINES = {
  google: ['Google', 'https://www.google.com/search?q='],
  duckduckgo: ['DuckDuckGo', 'https://duckduckgo.com/?q='],
  bing: ['Bing', 'https://www.bing.com/search?q='],
  brave: ['Brave Search', 'https://search.brave.com/search?q='],
};
const IMAGE_ENGINES = {
  lens: ['Google Lens', 'https://lens.google.com/uploadbyurl?url='],
  tineye: ['TinEye', 'https://tineye.com/search?url='],
  yandex: ['Yandex', 'https://yandex.com/images/search?rpt=imageview&url='],
  saucenao: ['SauceNAO', 'https://saucenao.com/search.php?url='],
};

function isHttp(u) {
  try {
    const p = new URL(u).protocol;
    return p === 'https:' || p === 'http:';
  } catch (_) {
    return false;
  }
}

/** @returns {{label: string, url: string}[]} */
function searchItems(params, pluginSettings) {
  const s = pluginSettings || {};
  if (!s.enabled) return [];
  const items = [];
  const text = String(params.selectionText || '').trim();
  if (s.text !== false && text && !params.isEditable) {
    const key = Object.prototype.hasOwnProperty.call(TEXT_ENGINES, s.textEngine) ? s.textEngine : 'google';
    const [name, base] = TEXT_ENGINES[key];
    const short = text.length > 24 ? text.slice(0, 24).trimEnd() + '…' : text;
    items.push({ label: 'Search ' + name + ' for "' + short + '"', url: base + encodeURIComponent(text.slice(0, 500)) });
  }
  if (s.images !== false && params.mediaType === 'image' && isHttp(params.srcURL)) {
    const key = Object.prototype.hasOwnProperty.call(IMAGE_ENGINES, s.imageEngine) ? s.imageEngine : 'lens';
    const [name, base] = IMAGE_ENGINES[key];
    items.push({ label: 'Search image with ' + name, url: base + encodeURIComponent(params.srcURL) });
  }
  return items;
}

module.exports = { searchItems, TEXT_ENGINES, IMAGE_ENGINES };
