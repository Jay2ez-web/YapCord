'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/068-people.js'), 'utf8');

test('people.byName indexes profiles, preserves ambiguity rules, and refreshes for a new profiles object', () => {
  const alice = { username: 'Alice', display_name: 'Member' };
  const bob = { username: 'Bob', display_name: 'Member' };
  const state = { profiles: { alice, bob } };
  const YM = {
    finder: { lazy: () => () => null },
    Store: { getState: () => state },
  };
  vm.runInNewContext(source, { YM });

  assert.equal(YM.people.byName('@ALICE'), alice);
  assert.equal(YM.people.byName('Member'), null);
  assert.equal(YM.people.byName('Missing'), null);

  const updatedAlice = { username: 'Alice', display_name: 'New Member' };
  state.profiles = { alice: updatedAlice, bob };
  assert.equal(YM.people.byName('New Member'), updatedAlice);
  assert.equal(YM.people.byName('Member'), bob);
});
