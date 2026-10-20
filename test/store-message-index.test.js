'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/040-store.js'), 'utf8');

test('Store.findMessage indexes the active channel and refreshes after immutable message updates', async () => {
  const state = {
    activeChannelId: 'channel-a',
    messages: {
      'channel-a': [{ id: 'active-1', content: 'first' }],
      'channel-b': [{ id: 'other-1', content: 'other channel' }],
    },
    extraMessages: { 'extra-1': { id: 'extra-1', content: 'reply context' } },
  };
  const api = {
    getState: () => state,
    setState: () => undefined,
    useStore: { subscribe: () => () => undefined },
  };
  const YM = {
    deferred() {
      let resolve;
      const promise = new Promise((res) => { resolve = res; });
      return { promise, resolve };
    },
    finder: { waitFor: async () => api },
    Events: { emit: () => undefined },
    log: { info: () => undefined, error: () => undefined },
  };
  vm.runInNewContext(source, { YM });
  await YM.Store.ready;

  assert.equal(YM.Store.findMessage('active-1').content, 'first');
  assert.equal(YM.Store.findMessage('other-1').content, 'other channel');
  assert.equal(YM.Store.findMessage('extra-1').content, 'reply context');
  assert.equal(YM.Store.findMessage('missing'), null);

  state.messages = {
    ...state.messages,
    'channel-a': [{ id: 'active-1', content: 'edited' }, { id: 'active-2', content: 'new' }],
  };
  assert.equal(YM.Store.findMessage('active-1').content, 'edited');
  assert.equal(YM.Store.findMessage('active-2').content, 'new');
});
