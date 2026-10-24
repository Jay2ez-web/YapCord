'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('BetterFolders offers a full labeled folder panel by default and retains compact mode', () => {
  let plugin;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/renderer/plugins/BetterFolders.js'), 'utf8'),
    { YM: { definePlugin: (value) => { plugin = value; } } },
  );
  assert.equal(plugin.options.sidebarStyle.default, 'expanded');
  assert.deepEqual(
    Array.from(plugin.options.sidebarStyle.options, ({ label, value }) => [label, value]),
    [['Full panel with names', 'expanded'], ['Compact icon rail', 'icons']],
  );
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/plugins/BetterFolders.js'), 'utf8');
  for (const requiredUiClass of ['ym-bf-folder-heading', 'ym-bf-server-name', 'ym-bf-server-status', 'ym-bf-server-badge']) {
    assert.ok(source.includes(requiredUiClass), `missing ${requiredUiClass}`);
  }
  assert.match(source, /onClick:\s*\(\)\s*=>\s*\{\s*const b = freshButton\(f\.id, i\)/);
});
