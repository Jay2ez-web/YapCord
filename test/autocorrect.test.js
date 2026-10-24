const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/plugins/AutoCorrect.js'), 'utf8');

function loadPlugin(initialEnabled, spellchecker = null) {
  let definition;
  let enabled = initialEnabled;
  let inputListener;
  let keyDownListener;
  let removedListener = false;
  let keyDownRemoved = false;
  const document = {
    addEventListener(type, listener, capture) {
      assert.equal(capture, true);
      if (type === 'input') inputListener = listener;
      else if (type === 'keydown') keyDownListener = listener;
      else assert.fail(`unexpected listener type: ${type}`);
    },
    removeEventListener(type, listener, capture) {
      assert.equal(capture, true);
      if (type === 'input') {
        assert.equal(listener, inputListener);
        removedListener = true;
      } else if (type === 'keydown') {
        assert.equal(listener, keyDownListener);
        keyDownRemoved = true;
      } else assert.fail(`unexpected listener type: ${type}`);
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
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
    dispatchEvent(event) {
      this.events.push(event);
      if (event.type === 'input' && inputListener) {
        inputListener({ target: this, inputType: event.inputType, isComposing: false });
      }
      return true;
    }
  }
  vm.runInNewContext(source, {
    YM,
    document,
    window: { YapCordSpellchecker: { create: () => spellchecker } },
    HTMLTextAreaElement: FakeTextarea,
    InputEvent: FakeInputEvent,
  });
  return {
    plugin: definition,
    enabled,
    getInputListener: () => inputListener,
    getKeyDownListener: () => keyDownListener,
    wasListenerRemoved: () => removedListener && keyDownRemoved,
    FakeTextarea,
  };
}

test('AutoCorrect enables only when the user has not explicitly set an enabled state', () => {
  const fresh = loadPlugin(undefined);
  assert.equal(fresh.enabled, true);
  assert.equal(fresh.plugin.enabledByDefault, true);
  assert.equal(loadPlugin(false).enabled, false);
});

test('dictionary suggestions preserve case without a hand-maintained typo list', () => {
  const { plugin } = loadPlugin(undefined);
  const checker = {
    correct: (word) => word === 'the' || word === 'grammarly' || word === 'automatically',
    suggest: (word) => ({ teh: ['the'], grammerly: ['grammarly'], automatcly: ['automatically'] }[word] || []),
  };
  assert.equal(plugin.api.findCorrection('teh ', 4, checker).fixed, 'the');
  assert.equal(plugin.api.findCorrection('Teh ', 4, checker).fixed, 'The');
  assert.equal(plugin.api.findCorrection('grammerly ', 10, checker).fixed, 'grammarly');
  assert.equal(plugin.api.findCorrection('automatcly ', 11, checker).fixed, 'automatically');
  assert.equal(plugin.api.findCorrection('teh ', 4), null);
});

test('corrections wait for a safe boundary and preserve punctuation', () => {
  const { plugin } = loadPlugin(undefined);
  const checker = { correct: (word) => word === 'the' || word === 'their', suggest: (word) => ({ teh: ['the'], thier: ['their'] }[word] || []) };
  assert.equal(plugin.api.findCorrection('teh', 3, checker), null);
  const sentence = plugin.api.findCorrection('teh. ', 5, checker);
  assert.equal(sentence.fixed, 'the');
  assert.equal(sentence.start, 0);
  assert.equal(sentence.end, 3);
  assert.equal(plugin.api.findCorrection('Thier!', 6, checker).fixed, 'Their');
});

test('URLs, domains, mentions, hashtags, identifiers, and code are left unchanged', () => {
  const { plugin } = loadPlugin(undefined);
  for (const value of ['www.teh ', 'https://teh ', 'example.teh ', 'mail@teh ', '@teh ', '#teh ', 'foo_teh ', '`teh `', '```\nteh ']) {
    assert.equal(plugin.api.findCorrection(value, value.length), null, value);
  }
  assert.equal(plugin.api.findCorrection('caféteh ', 8), null);
});

test('offline spelling engine suggestions correct a uniquely nearest misspelling', () => {
  const { plugin } = loadPlugin(undefined);
  const checker = {
    correct: (word) => word === 'spelling',
    suggest: () => ['spelling'],
  };
  const correction = plugin.api.findCorrection('speling ', 8, checker);
  assert.deepEqual(JSON.parse(JSON.stringify(correction)), { start: 0, end: 7, fixed: 'spelling' });
  assert.equal(plugin.api.findCorrection('speling ', 8, {
    correct: () => false,
    suggest: () => ['spelling', 'spieling'],
  }), null);
});

test('offline grammar rules fix safe capitalization, duplicate words, articles, and common homophones', () => {
  const { plugin } = loadPlugin(undefined);
  const correction = (value) => plugin.api.findCorrection(value, value.length);
  assert.equal(correction('i ').fixed, 'I');
  assert.equal(plugin.api.editDistance('teh', 'the'), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(correction('the the '))), { start: 0, end: 7, fixed: 'the' });
  assert.deepEqual(JSON.parse(JSON.stringify(correction('a apple '))), { start: 0, end: 7, fixed: 'an apple' });
  assert.equal(correction('a honest ').fixed, 'an honest');
  assert.equal(correction('an hour '), null);
  assert.equal(correction('an user ').fixed, 'a user');
  assert.equal(correction('your welcome ').fixed, "you're welcome");
  assert.equal(correction('could of ').fixed, "could've");
});

test('bundled English spell engine runs locally and supplies no network interface', () => {
  const engineSource = fs.readFileSync(path.join(__dirname, '../src/renderer/plugins/AutoCorrectEngine.js'), 'utf8');
  const window = {};
  vm.runInNewContext(engineSource, { window });
  assert.equal(typeof window.YapCordSpellchecker.create, 'function');
  const checker = window.YapCordSpellchecker.create();
  assert.equal(checker.correct('message'), true);
  assert.equal(checker.correct('speling'), false);
  assert.ok(checker.suggest('speling').includes('spelling'));
  assert.equal(window.YapCordSpellchecker.fetch, undefined);
});

test('typing autocorrects the final word, dispatches an input replacement, and cleans up', async () => {
  const loaded = loadPlugin(undefined, {
    correct: (word) => word === 'the',
    suggest: (word) => word === 'teh' ? ['the'] : [],
  });
  const cleanup = [];
  const ctx = {
    settings: {
      store: { autoCorrect: true },
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
  let prevented = false;
  loaded.getKeyDownListener()({
    key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, target: field,
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(field.value, 'teh ');
  assert.equal(field.selectionStart, 4);
  assert.equal(field.events.length, 2);
  cleanup[0]();
  assert.equal(loaded.wasListenerRemoved(), true);
});

test('pasted text and disabled settings are not autocorrected', async () => {
  const loaded = loadPlugin(undefined);
  const ctx = {
    settings: {
      store: { autoCorrect: true },
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
