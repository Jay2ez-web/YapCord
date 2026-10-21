'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const OWNER_ID = 'e46be3da-39b3-4a1a-b003-042d27d71e9d';
const CONTRIBUTOR_ID = 'fc529a6a-ddbd-445b-8bce-18a13acca5d0';

function makeElement(tagName = 'span') {
  const node = {
    tagName,
    attributes: Object.create(null),
    children: [],
    parent: null,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    append(child) { child.parent = this; this.children.push(child); },
    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    },
    querySelector(selector) {
      if (selector.startsWith(':scope > .')) {
        const className = selector.slice(':scope > .'.length);
        return this.children.find((child) => (child.getAttribute('class') || '').split(/\s+/).includes(className)) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector.startsWith(':scope > .')) {
        const className = selector.slice(':scope > .'.length);
        return this.children.filter((child) => (child.getAttribute('class') || '').split(/\s+/).includes(className));
      }
      return [];
    },
    closest(selector) {
      let cur = this;
      while (cur) {
        if (selector === '[data-user-id]' && cur.getAttribute('data-user-id')) return cur;
        if (selector === '[data-server-id], [data-guild-id]' && (cur.getAttribute('data-server-id') || cur.getAttribute('data-guild-id'))) return cur;
        cur = cur.parent;
      }
      return null;
    },
  };
  return node;
}

function loadBadge({ state, prefs } = {}) {
  let onBoot;
  const eventHandlers = new Map();
  const settingsHandlers = new Set();
  const decorators = new Set();
  const visible = [];
  const allNodes = [];
  const css = new Map();
  const currentState = state || {
    activeServerId: 'server-1',
    activeChannelId: 'channel-1',
    channels: { 'channel-1': { server_id: 'server-1' } },
    roles: { 'server-1': [{ id: 'og-role', name: 'OG Yapper' }] },
    memberRoles: { 'server-1': {} },
  };
  const settingsData = {
    showOwner: true,
    showContributor: true,
    showOgYapper: true,
    ogRoleName: 'OG Yapper',
    ...(prefs || {}),
  };
  const getSetting = (path, fallback) => path.split('.').reduce((value, key) => value == null ? undefined : value[key], { badges: settingsData }) ?? fallback;
  const YM = {
    dom: {
      h(tag, attrs) {
        const node = makeElement(tag);
        allNodes.push(node);
        for (const [name, value] of Object.entries(attrs || {})) node.setAttribute(name, value);
        return node;
      },
      watch() { return () => {}; },
      css: { set(name, text) { css.set(name, text); } },
    },
    settings: {
      get: getSetting,
      onChange(fn) { settingsHandlers.add(fn); return () => settingsHandlers.delete(fn); },
      set(path, value) {
        const key = path.slice('badges.'.length);
        settingsData[key] = value;
        for (const fn of settingsHandlers) fn(path, value);
      },
    },
    Store: {
      getState() { return currentState; },
      channel(id) { return currentState.channels && currentState.channels[id] || null; },
    },
    Events: {
      once(name, callback) { if (name === 'boot:ready') onBoot = callback; },
      on(name, callback) {
        if (!eventHandlers.has(name)) eventHandlers.set(name, new Set());
        eventHandlers.get(name).add(callback);
        return () => eventHandlers.get(name).delete(callback);
      },
      emit(name, ...args) { for (const fn of eventHandlers.get(name) || []) fn(...args); },
    },
    messages: {
      decorate(callback) { decorators.add(callback); return () => decorators.delete(callback); },
      forEachVisible(callback) { for (const item of visible) callback(item); },
      refresh() { for (const item of visible) for (const callback of decorators) callback(item); },
    },
    log: { warn() {} },
  };
  const document = {
    createElementNS(_namespace, tag) { const node = makeElement(tag); allNodes.push(node); return node; },
    querySelectorAll(selector) {
      if (selector === '.' + 'ym-custom-role-badge') {
        return allNodes.filter((node) => (node.getAttribute('class') || '').split(/\s+/).includes('ym-custom-role-badge') && node.parent);
      }
      return [];
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/091-custom-badge.js'), 'utf8');
  vm.runInNewContext(source, { YM, document, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {} });
  assert.equal(typeof onBoot, 'function', 'badge code registers a boot callback');
  onBoot();
  return {
    YM,
    css,
    settingsData,
    addVisible(item) { visible.push(item); },
    cleanup: () => YM.customBadgeCleanup(),
    decorate(message, name = makeElement()) {
      const el = { querySelector() { return name; } };
      const item = { el, message };
      for (const callback of decorators) callback(item);
      return name;
    },
  };
}

function badgeKeys(name) {
  return name.querySelectorAll(':scope > .ym-custom-role-badge').map((badge) => badge.getAttribute('data-ym-role'));
}

function message(userId, channelId = 'channel-1') {
  return { author_id: userId, channel_id: channelId };
}

test('owner crown and gold contributor star coexist with native Yapper badges', () => {
  const { decorate, css } = loadBadge();
  const ownerName = makeElement();
  const native = makeElement();
  native.setAttribute('class', 'ubadge');
  ownerName.append(native);
  decorate(message(OWNER_ID), ownerName);
  assert.deepEqual(badgeKeys(ownerName), ['owner']);

  const contributor = decorate(message(CONTRIBUTOR_ID));
  assert.deepEqual(badgeKeys(contributor), ['contributor']);
  assert.match(css.get('custom-role-badge'), /data-ym-role="contributor"[^}]*#ffe58b/i);
  assert.match(css.get('custom-role-badge'), /data-ym-role="contributor"[^}]*#d99508/i);
  assert.match(css.get('custom-role-badge'), /--ym-badge-glow: #ffcf50/i);
  assert.match(css.get('custom-role-badge'), /box-sizing: border-box/i);
  assert.match(css.get('custom-role-badge'), /flex: 0 0 \.98em/i);
  assert.match(css.get('custom-role-badge'), /vertical-align: -\.1em/i);
  assert.match(css.get('custom-role-badge'), /0 0 5px var\(--ym-badge-glow\)/i);
  assert.equal(ownerName.children[0], native, 'the native site badge remains in the DOM');
});

test('OG Yapper badge is automatic for a matching role in the message server only', () => {
  const state = {
    activeServerId: 'server-1',
    activeChannelId: 'channel-1',
    channels: { 'channel-1': { server_id: 'server-1' }, 'channel-2': { server_id: 'server-2' } },
    roles: {
      'server-1': [{ id: 'og-one', name: '  oG   YaPPer ' }],
      'server-2': [{ id: 'og-two', name: 'OG Yapper' }],
    },
    memberRoles: {
      'server-1': { 'og-member': ['og-one'] },
      'server-2': { 'other-server-member': ['og-two'] },
    },
  };
  const { decorate } = loadBadge({ state });
  assert.deepEqual(badgeKeys(decorate(message('og-member', 'channel-1'))), ['og']);
  assert.deepEqual(badgeKeys(decorate(message('other-server-member', 'channel-1'))), [], 'a same-named role from another server is not enough');
  assert.deepEqual(badgeKeys(decorate(message('other-server-member', 'channel-2'))), ['og']);
});

test('contributors with the OG role can show both badges or independently hide either one', () => {
  const state = {
    activeServerId: 'server-1',
    channels: { 'channel-1': { server_id: 'server-1' } },
    roles: { 'server-1': [{ id: 'og-role', name: 'OG Yapper' }] },
    memberRoles: { 'server-1': { [CONTRIBUTOR_ID]: ['og-role'] } },
  };
  const { decorate, settingsData, addVisible, YM } = loadBadge({ state });
  const row = { el: { querySelector() { return rowName; } }, message: message(CONTRIBUTOR_ID) };
  const rowName = makeElement();
  addVisible(row);
  YM.messages.refresh();
  assert.deepEqual(badgeKeys(rowName), ['contributor', 'og']);

  YM.settings.set('badges.showContributor', false);
  assert.deepEqual(badgeKeys(rowName), ['og'], 'turning off contributor leaves OG enabled');
  YM.settings.set('badges.showOgYapper', false);
  assert.deepEqual(badgeKeys(rowName), [], 'turning off OG leaves no role badges');
  assert.equal(settingsData.showContributor, false);
  assert.equal(settingsData.showOgYapper, false);
});

test('badge cleanup removes only YapCord badges', () => {
  const { decorate, cleanup } = loadBadge();
  const name = decorate(message(OWNER_ID));
  const native = makeElement();
  native.setAttribute('class', 'ubadge');
  name.append(native);
  cleanup();
  assert.deepEqual(badgeKeys(name), []);
  assert.equal(name.children[0], native, 'cleanup leaves Yapper-owned badges untouched');
});
