'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPlugin(file, expectedName) {
  let plugin;
  const YM = { definePlugin(value) { plugin = value; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/plugins', file), 'utf8'), { YM });
  assert.equal(plugin && plugin.name, expectedName);
  return plugin;
}

test('SplitLargeMessages preserves text and stays within the UTF-16 limit', () => {
  const split = loadPlugin('SplitLargeMessages.js', 'SplitLargeMessages').api.splitMessage;
  const text = 'alpha beta\ngamma 😀 delta epsilon';
  for (const mode of ['newlines', 'spaces', 'characters']) {
    const chunks = split(text, 12, mode);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every((chunk) => chunk.length <= 12));
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk)));
  }
});

test('SplitLargeMessages handles exact limits, empty content and tiny/invalid limits', () => {
  const split = loadPlugin('SplitLargeMessages.js', 'SplitLargeMessages').api.splitMessage;
  assert.deepEqual(Array.from(split('exact', 5)), ['exact']);
  assert.deepEqual(Array.from(split('', 5)), ['']);
  assert.deepEqual(Array.from(split('abc', 0)), []);
  assert.deepEqual(Array.from(split('abc', 1, 'characters')), ['a', 'b', 'c']);
});

test('SplitLargeMessages sends follow-ups sequentially with original auth options and no recursive split', async () => {
  let hook;
  let plugin;
  const sent = [];
  const YM = {
    definePlugin(value) { plugin = value; },
    net: { onFetch(value) { hook = value; return () => undefined; } },
    Store: { getState: () => ({ activeChannelId: 'channel-1' }), channel: () => null },
    util: { copyText: async () => true },
    toast() {},
    log: { warn() {} },
  };
  // Re-evaluate the module against a runnable API harness (loadPlugin above only captures registration).
  const window = { fetch(url, init) {
    const context = { url, method: init.method, json: JSON.parse(init.body), init: { ...init } };
    hook.before(context);
    sent.push({ context, init });
    return Promise.resolve({ ok: true });
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/plugins/SplitLargeMessages.js'), 'utf8'), {
    YM,
    window,
    setTimeout(callback) { queueMicrotask(callback); return 1; },
    clearTimeout() {},
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    document: { querySelector: () => null },
    InputEvent: class InputEvent {},
  });
  assert.equal(plugin.name, 'SplitLargeMessages');
  plugin.start({ settings: { store: { limit: 100, splitMode: 'characters', delayMs: 500 } }, cleanup() {}, log: { warn() {} } });
  const request = {
    url: 'https://yapper.example/rest/v1/messages',
    method: 'POST',
    json: { channel_id: 'channel-1', content: 'a'.repeat(220) },
    init: { credentials: 'include', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify({ channel_id: 'channel-1', content: 'a'.repeat(220) }) },
  };
  hook.before(request);
  assert.equal(request.json.content.length, 100);
  await hook.after(request, { ok: true });
  assert.deepEqual(sent.map(({ context }) => context.json.content.length), [100, 20]);
  assert.equal(sent.map(({ context }) => context.json.content).join(''), 'a'.repeat(120));
  assert.equal(sent[0].init.credentials, 'include');
  assert.equal(sent[0].init.headers.Authorization, 'Bearer test-token');
});

test('MoreUserTags derives only labels supported by loaded server roles', () => {
  const tags = loadPlugin('MoreUserTags.js', 'MoreUserTags').api;
  const state = {
    servers: { s1: { owner_id: 'owner' } },
    roles: { s1: [
      { id: 'admin', perms: { administrator: true } },
      { id: 'mod', perms: { manage_messages: true } },
      { id: 'voice', perms: { move_members: true } },
    ] },
    memberRoles: { s1: { admin: ['admin'], mod: ['mod'], voice: ['voice'], plain: [] } },
  };
  assert.equal(tags.tagFor(state, 's1', 'owner').key, 'owner');
  assert.equal(tags.tagFor(state, 's1', 'admin').key, 'admin');
  assert.equal(tags.tagFor(state, 's1', 'mod').key, 'moderator');
  assert.equal(tags.tagFor(state, 's1', 'voice').key, 'voice');
  assert.equal(tags.tagFor(state, 's1', 'plain'), null);
  assert.equal(tags.tagFor(state, null, 'admin'), null);
  assert.equal(tags.tagFor(state, 's1', 'admin', { admin: false }), null);
});

test('Quoter text wrapping never drops words or splits surrogate pairs', () => {
  const wrap = loadPlugin('Quoter.js', 'Quoter').api.wrapText;
  const text = 'a sentence with emoji 😀 and words';
  const lines = wrap(text, 7, (value) => value.length);
  assert.equal(lines.join('').replace(/\s+/g, ''), text.replace(/\s+/g, ''));
  assert.ok(lines.every((line) => !/[\uD800-\uDBFF]$/.test(line)));
});
