const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/plugins/AutoCorrect.js'), 'utf8');

function loadPlugin(initialEnabled) {
  let definition;
  let enabled = initialEnabled;
  let inputListener;
  let removedListener = false;
  const document = {
    addEventListener(type, listener, capture) {
      assert.equal(type, 'input');
      assert.equal(capture, true);
      inputListener = listener;
    },
    removeEventListener(type, listener, capture) {
      assert.equal(type, 'input');
      assert.equal(listener, inputListener);
      assert.equal(capture, true);
      removedListener = true;
    },
  };
  const YM = {
    settings: {
      get: () => enabled,
      set: (key, value) => {
        assert.equal(key, 'plugins.AutoCorrect.enabled');
        enabled = value;
      },
    },
    definePlugin: (plugin) => { definition = plugin; },
  };
  class FakeInputEvent {
    constructor(type, init) { this.type = type; Object.assign(this, init); }
  }
  class FakeTextarea {
    constructor(value) {
      this.value = value;
      this.selectionStart = value.length;
      this.selectionEnd = value.length;
      this.disabled = false;
      this.readOnly = false;
      this.isConnected = true;
      this.events = [];
    }
    matches(selector) { return selector === '.composer textarea'; }
    setRangeText(text, start, end, mode) {
      const oldStart = this.selectionStart;
      const oldEnd = this.selectionEnd;
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      if (mode === 'preserve') {
        const delta = text.length - (end - start);
        const adjust = (position) => position > end ? position + delta : position > start ? start + text.length : position;
        this.selectionStart = adjust(oldStart);
        this.selectionEnd = adjust(oldEnd);
      }
    }
    dispatchEvent(event) {
      this.events.push(event);
      if (event.type === 'input' && inputListener) {
        inputListener({ target: this, inputType: event.inputType, isComposing: false });
      }
      return true;
    }
  }
  vm.runInNewContext(source, { YM, document, HTMLTextAreaElement: FakeTextarea, InputEvent: FakeInputEvent });
  return { plugin: definition, enabled, getInputListener: () => inputListener, wasListenerRemoved: () => removedListener, FakeTextarea };
}

test('AutoCorrect enables only when the user has not explicitly set an enabled state', () => {
  const fresh = loadPlugin(undefined);
  assert.equal(fresh.enabled, true);
  assert.equal(fresh.plugin.enabledByDefault, true);
  assert.equal(loadPlugin(false).enabled, false);
});

test('built-in and custom corrections preserve case and support multiword replacements', () => {
  const { plugin } = loadPlugin(undefined);
  const dict = plugin.api.buildDictionary('teh=thee\ncustomtypo=custom phrase');
  assert.equal(plugin.api.findCorrection('teh ', 4, dict).fixed, 'thee');
  assert.equal(plugin.api.findCorrection('Teh ', 4, dict).fixed, 'Thee');
  assert.equal(plugin.api.findCorrection('TEH ', 4, dict).fixed, 'THEE');
  assert.equal(plugin.api.findCorrection('grammerly ', 10, dict).fixed, 'Grammarly');
  assert.equal(plugin.api.findCorrection('automatcly ', 11, dict).fixed, 'automatically');
  assert.equal(plugin.api.findCorrection('alot ', 5, dict).fixed, 'a lot');
});

test('corrections wait for a safe boundary and preserve punctuation', () => {
  const { plugin } = loadPlugin(undefined);
  const dict = plugin.api.buildDictionary('');
  assert.equal(plugin.api.findCorrection('teh', 3, dict), null);
  const sentence = plugin.api.findCorrection('teh. ', 5, dict);
  assert.equal(sentence.fixed, 'the');
  assert.equal(sentence.start, 0);
  assert.equal(sentence.end, 3);
  assert.equal(plugin.api.findCorrection('Thier!', 6, dict).fixed, 'Their');
});

test('URLs, domains, mentions, hashtags, identifiers, and code are left unchanged', () => {
  const { plugin } = loadPlugin(undefined);
  const dict = plugin.api.buildDictionary('');
  for (const value of ['www.teh ', 'https://teh ', 'example.teh ', 'mail@teh ', '@teh ', '#teh ', 'foo_teh ', '`teh `', '```\nteh ']) {
    assert.equal(plugin.api.findCorrection(value, value.length, dict), null, value);
  }
  assert.equal(plugin.api.findCorrection('caféteh ', 8, dict), null);
});

test('typing autocorrects the final word, dispatches an input replacement, and cleans up', async () => {
  const loaded = loadPlugin(undefined);
  const cleanup = [];
  const ctx = {
    settings: {
      store: { autoCorrect: true, customCorrections: '' },
      onChange: () => () => undefined,
    },
    cleanup: (fn) => cleanup.push(fn),
  };
  loaded.plugin.start(ctx);
  const field = new loaded.FakeTextarea('teh ');
  loaded.getInputListener()({ target: field, inputType: 'insertText', isComposing: false });
  await Promise.resolve();
  assert.equal(field.value, 'the ');
  assert.equal(field.selectionStart, 4);
  assert.equal(field.events.length, 1);
  assert.equal(field.events[0].inputType, 'insertReplacementText');
  cleanup[0]();
  assert.equal(loaded.wasListenerRemoved(), true);
});

test('pasted text and disabled settings are not autocorrected', async () => {
  const loaded = loadPlugin(undefined);
  const ctx = {
    settings: {
      store: { autoCorrect: true, customCorrections: '' },
      onChange: () => () => undefined,
    },
    cleanup: () => undefined,
  };
  loaded.plugin.start(ctx);
  const pasted = new loaded.FakeTextarea('teh ');
  loaded.getInputListener()({ target: pasted, inputType: 'insertFromPaste', isComposing: false });
  await Promise.resolve();
  assert.equal(pasted.value, 'teh ');
  ctx.settings.store.autoCorrect = false;
  const disabled = new loaded.FakeTextarea('teh ');
  loaded.getInputListener()({ target: disabled, inputType: 'insertText', isComposing: false });
  await Promise.resolve();
  assert.equal(disabled.value, 'teh ');
});
