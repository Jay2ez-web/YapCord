'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/plugins/Ported_notificationTweaks.js'), 'utf8');

function loadPlugin(extra = {}) {
  let plugin;
  const YM = {
    definePlugin(value) { plugin = value; },
    ...extra.YM,
  };
  vm.runInNewContext(source, { YM, ...extra.globals });
  assert.equal(plugin && plugin.name, 'Notification Tweaks');
  return { plugin, YM };
}

function makeNode(tag, attrs = {}, children = []) {
  const node = {
    tag,
    attrs,
    children,
    style: {},
    disabled: !!attrs.disabled,
    value: '',
    files: null,
    textContent: '',
    append(...items) { this.children.push(...items); },
    click() { return attrs.onClick && attrs.onClick({ target: this }); },
    pause() { this.paused = true; },
    removeAttribute(name) { if (name === 'src') this.src = ''; },
    load() {},
  };
  return node;
}

function flatten(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...(node.children || []).flatMap((child) => flatten(child))];
}

function settings(values = {}) {
  const writes = [];
  const store = new Proxy({ volume: 55, customSoundData: '', customSoundName: '', ...values }, {
    set(target, key, value) { target[key] = value; return true; },
  });
  return {
    store,
    writes,
    set(key, value) { writes.push([key, value]); store[key] = value; },
  };
}

test('Notification Tweaks validates audio types and exposes a bounded import size', () => {
  const { plugin } = loadPlugin();
  assert.equal(plugin.api.MAX_SOUND_BYTES, 1_500_000);
  assert.equal(plugin.api.isAudioFile({ name: 'custom.mp3', type: 'audio/mpeg' }), true);
  assert.equal(plugin.api.isAudioFile({ name: 'custom.mp3', type: '' }), true);
  assert.equal(plugin.api.isAudioFile({ name: 'notes.txt', type: 'text/plain' }), false);
  assert.equal(plugin.api.isAudioFile(null), false);
  assert.equal(plugin.options.customSoundData.hidden, true);
  assert.equal(plugin.options.customSoundName.hidden, true);
  assert.equal(plugin.options.importSound.type, 'custom');
});

test('Import sound button saves selected audio, shows its name, and offers remove and preview controls', async () => {
  const toasts = [];
  const { plugin } = loadPlugin({
    YM: {
      dom: { h(tag, attrs, ...children) {
        if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return makeNode(tag, {}, [attrs, ...children].filter((v) => v !== undefined));
        return makeNode(tag, attrs, children);
      } },
      toast(message) { toasts.push(message); },
    },
    globals: {
      FileReader: class {
        readAsDataURL(file) { this.result = `data:${file.type};base64,YWJj`; this.onload(); }
      },
    },
  });
  const prefs = settings();
  const box = makeNode('div');
  plugin.options.importSound.render(box, { settings: prefs });
  const nodes = flatten(box);
  const importButton = nodes.find((node) => node.tag === 'button' && node.children.includes('Import sound'));
  const input = nodes.find((node) => node.tag === 'input');
  const clear = nodes.find((node) => node.tag === 'button' && node.children.includes('Remove sound'));
  const play = nodes.find((node) => node.tag === 'button' && node.children.includes('Play test'));
  const status = nodes.find((node) => node.tag === 'div' && node.attrs.class === 'hint');
  assert.ok(importButton && input && clear && play && status);
  assert.equal(input.attrs.accept, 'audio/*');
  assert.equal(clear.disabled, true);
  assert.equal(play.disabled, true);
  importButton.click();
  assert.equal(input.click(), undefined);

  input.files = [{ name: 'ding.ogg', type: 'audio/ogg', size: 3 }];
  await input.attrs.onChange();
  assert.equal(prefs.store.customSoundData, 'data:audio/ogg;base64,YWJj');
  assert.equal(prefs.store.customSoundName, 'ding.ogg');
  assert.equal(clear.disabled, false);
  assert.equal(play.disabled, false);
  assert.match(status.textContent, /ding\.ogg/);
  assert.ok(toasts.some((message) => /imported/i.test(message)));
});

test('Import sound rejects non-audio and oversized files without replacing stored settings', async () => {
  const toasts = [];
  const { plugin } = loadPlugin({
    YM: {
      dom: { h(tag, attrs, ...children) {
        if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return makeNode(tag, {}, [attrs, ...children].filter((v) => v !== undefined));
        return makeNode(tag, attrs, children);
      } },
      toast(message) { toasts.push(message); },
    },
    globals: { FileReader: class { readAsDataURL() { throw new Error('should not read rejected file'); } } },
  });
  const prefs = settings({ customSoundData: 'data:audio/mpeg;base64,OLD', customSoundName: 'old.mp3' });
  const box = makeNode('div');
  plugin.options.importSound.render(box, { settings: prefs });
  const input = flatten(box).find((node) => node.tag === 'input');
  input.files = [{ name: 'bad.txt', type: 'text/plain', size: 5 }];
  await input.attrs.onChange();
  assert.equal(prefs.store.customSoundData, 'data:audio/mpeg;base64,OLD');
  input.files = [{ name: 'large.mp3', type: 'audio/mpeg', size: 1_500_001 }];
  await input.attrs.onChange();
  assert.equal(prefs.store.customSoundData, 'data:audio/mpeg;base64,OLD');
  assert.equal(toasts.length, 2);
});

test('new messages play the imported sound at the selected volume and plugin stop releases it', async () => {
  let decorate;
  const played = [];
  const audioItems = [];
  class AudioStub {
    constructor(src) { this.src = src; this.volume = 1; this.currentTime = 0; this.paused = false; audioItems.push(this); }
    play() { this.paused = false; played.push({ src: this.src, volume: this.volume }); return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() {}
  }
  const { plugin } = loadPlugin({
    YM: { messages: { decorate(fn) { decorate = fn; return () => undefined; } }, log: { warn() {} } },
    globals: {
      Audio: AudioStub,
      document: {
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {},
      },
    },
  });
  const cleanups = [];
  plugin.start({
    settings: { store: { volume: 35, customSoundData: 'data:audio/wav;base64,AAAA' } },
    cleanup(fn) { cleanups.push(fn); },
  });
  decorate({ id: 'new-message' });
  decorate({ id: 'new-message' });
  await Promise.resolve();
  assert.deepEqual(played, [{ src: 'data:audio/wav;base64,AAAA', volume: 0.35 }]);
  cleanups[0]();
  assert.equal(audioItems[0].paused, true);
  assert.equal(audioItems[0].src, '');
});
