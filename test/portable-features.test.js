const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../src/renderer/plugins');

function load(name, { platform = 'Win32', document = {}, store = {} } = {}) {
  let plugin;
  const listeners = new Map();
  const window = {
    addEventListener(type, fn, capture) { listeners.set(type, { fn, capture }); },
    removeEventListener(type, fn, capture) {
      const item = listeners.get(type);
      if (item && item.fn === fn && item.capture === capture) listeners.delete(type);
    },
  };
  const navigator = { platform, userAgentData: null };
  const YM = {
    definePlugin(def) { plugin = def; return def; },
    Store: { openSettings: (...args) => store.openSettings && store.openSettings(...args) },
    dom: { h: (_tag, props, ...children) => ({ props, children, remove() {} }) },
    toast() {},
  };
  const src = fs.readFileSync(path.join(root, name + '.js'), 'utf8');
  vm.runInNewContext(src, { YM, window, navigator, document, HTMLVideoElement: document.HTMLVideoElement || class HTMLVideoElement {}, String, RegExp, Array, Error, Promise }, { filename: name + '.js' });
  const cleanups = [];
  plugin.start({ cleanup: fn => cleanups.push(fn) });
  return { plugin, listeners, cleanups, window, navigator };
}

test('NoF1 prevents default only for F1 and removes its listener on disable', () => {
  const loaded = load('NoF1');
  let prevented = 0;
  loaded.listeners.get('keydown').fn({ key: 'F1', defaultPrevented: false, preventDefault() { prevented++; } });
  loaded.listeners.get('keydown').fn({ key: 'F2', defaultPrevented: false, preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  loaded.cleanups.forEach(fn => fn());
  assert.equal(loaded.listeners.size, 0);
});

test('NoMiddleClickPaste acts only on Linux middle-button mouseup', () => {
  const windows = load('NoMiddleClickPaste', { platform: 'Win32' });
  assert.equal(windows.listeners.size, 0);
  const linux = load('NoMiddleClickPaste', { platform: 'Linux x86_64' });
  let prevented = 0;
  linux.listeners.get('mouseup').fn({ button: 0, preventDefault() { prevented++; } });
  linux.listeners.get('mouseup').fn({ button: 1, preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  linux.cleanups.forEach(fn => fn());
  assert.equal(linux.listeners.size, 0);
});

test('WebKeybinds opens settings with Ctrl/Cmd+comma and leaves editable targets alone', () => {
  let opened = 0;
  const loaded = load('WebKeybinds', { store: { openSettings() { opened++; } } });
  let prevented = 0;
  const handler = loaded.listeners.get('keydown').fn;
  handler({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, key: ',', target: { tagName: 'DIV' }, preventDefault() { prevented++; } });
  handler({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, key: ',', target: { tagName: 'TEXTAREA' }, preventDefault() { prevented++; } });
  assert.equal(opened, 1);
  assert.equal(prevented, 1);
  loaded.cleanups.forEach(fn => fn());
  assert.equal(loaded.listeners.size, 0);
});

test('PictureInPicture requests PiP on the original video only after a button click', async () => {
  let decorate;
  let pipCalls = 0;
  const buttonList = [];
  const actions = { querySelector() { return null; }, prepend(node) { buttonList.push(node); } };
  let video;
  const row = { querySelector(selector) { return selector === 'video' ? video : selector === ':scope > .msg-actions' ? actions : null; } };
  class Video { closest(selector) { return selector === '.msg' ? row : null; } async requestPictureInPicture() { pipCalls++; } }
  video = new Video();
  const document = { pictureInPictureEnabled: true, querySelectorAll() { return []; } };
  const src = fs.readFileSync(path.join(root, 'PictureInPicture.js'), 'utf8');
  let plugin;
  const YM = {
    definePlugin(def) { plugin = def; return def; },
    dom: { h: (_tag, props, ...children) => ({ props, children, remove() {} }) },
    messages: { decorate(fn) { decorate = fn; return () => { decorate = null; }; } },
    toast() {},
  };
  vm.runInNewContext(src, { YM, document, window: {}, navigator: {}, HTMLVideoElement: Video, String, RegExp, Array, Error, Promise }, { filename: 'PictureInPicture.js' });
  plugin.start({ cleanup() {} });
  decorate({ el: row });
  assert.equal(buttonList.length, 1);
  await buttonList[0].props.onClick({ stopPropagation() {} });
  assert.equal(pipCalls, 1);
});
