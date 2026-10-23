const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '../src/renderer/plugins/ShowHiddenChannels.js');

function loadPlugin() {
  let plugin;
  const YM = {
    definePlugin(def) { plugin = def; return def; },
    dom: { h() { throw new Error('DOM should not be needed for metadata collection'); } },
    Store: { getState() { return null; } },
    toast() {},
    modal: { open() { return null; } },
    get net() { throw new Error('network access is not allowed'); },
  };
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), { YM, Map, Set, Object, Array, Number, String }, { filename: 'ShowHiddenChannels.js' });
  return plugin;
}

test('ShowHiddenChannels lists cached channels, including explicit hidden metadata, without requesting network data', () => {
  const plugin = loadPlugin();
  const state = {
    servers: { s1: { id: 's1', name: 'Test Server' } },
    categories: {
      cat1: { id: 'cat1', server_id: 's1', name: 'Private section', hidden: true },
      cat2: { id: 'cat2', server_id: 's2', name: 'Other server' },
    },
    channels: {
      visible: { id: 'visible', server_id: 's1', category_id: 'cat1', name: 'public-chat', kind: 'text' },
      hidden: { id: 'hidden', server_id: 's1', category_id: 'cat1', name: 'locked-room', type: 'voice', topic: 'metadata only' },
      unrelated: { id: 'unrelated', server_id: 's2', name: 'not-this-server' },
    },
  };
  const data = plugin.api.collect(state, 's1');
  assert.equal(data.channelCount, 2);
  assert.equal(data.hiddenCount, 2, 'an explicitly hidden category marks its cached channels');
  assert.deepEqual(Array.from(data.groups[0].channels, (channel) => channel.name), ['locked-room', 'public-chat']);
  assert.equal(plugin.api.hasExplicitHiddenFlag(state.channels.hidden), false);
  assert.equal(plugin.api.hasExplicitHiddenFlag(state.categories.cat1), true);
});

test('ShowHiddenChannels accepts server/guild field aliases and refreshable per-server record collections', () => {
  const plugin = loadPlugin();
  const state = {
    guilds: { g1: { id: 'g1', name: 'Guild One' } },
    categories: { g1: [{ id: 'c1', guild_id: 'g1', name: 'General' }] },
    channels: { g1: [
      { id: 'a', guild_id: 'g1', parent_id: 'c1', name: 'alpha', can_view: false },
      { id: 'b', serverId: 'g1', categoryId: 'c1', name: 'beta', visibility: 'hidden' },
      { id: 'c', guild_id: 'g2', name: 'other' },
    ] },
  };
  const data = plugin.api.collect(state, 'g1');
  assert.equal(data.server.name, 'Guild One');
  assert.equal(data.channelCount, 2);
  assert.equal(data.hiddenCount, 2);
  assert.deepEqual(Array.from(data.groups[0].channels, (channel) => channel.name), ['alpha', 'beta']);
});

test('private/read-only labels are not treated as proof that the current user lacks channel access', () => {
  const plugin = loadPlugin();
  assert.equal(plugin.api.hasExplicitHiddenFlag({ private: true, read_only: true, name: 'private-room' }), false);
  assert.equal(plugin.api.hasExplicitHiddenFlag({ permissions: { view_channel: false } }), true);
  assert.equal(plugin.enabledByDefault, false);
});
