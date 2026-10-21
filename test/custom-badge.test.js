'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function element(tagName = 'span') {
  return {
    tagName,
    attributes: Object.create(null),
    children: [],
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    append(child) { child.parent = this; this.children.push(child); },
    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((child) => child !== this);
    },
    querySelector(selector) {
      if (selector === ':scope > .ym-custom-role-badge') {
        return this.children.find((child) => child.getAttribute('class') === 'ym-custom-role-badge') || null;
      }
      if (selector === ':scope > .ym-owner-crown') {
        return this.children.find((child) => child.getAttribute('class') === 'ym-owner-crown') || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ':scope > .ym-owner-crown') {
        return this.children.filter((child) => child.getAttribute('class') === 'ym-owner-crown');
      }
      if (selector === '.ym-custom-role-badge') {
        return this.children.filter((child) => child.getAttribute('class') === 'ym-custom-role-badge');
      }
      return [];
    },
    closest() { return null; },
  };
}

function loadBadge() {
  let onBoot;
  let decorate;
  const YM = {
    dom: {
      h(tag, attrs) {
        const node = element(tag);
        for (const [name, value] of Object.entries(attrs || {})) node.setAttribute(name, value);
        return node;
      },
      watch() { return () => {}; },
      css: { set() {} },
    },
    Events: {
      once(name, callback) { if (name === 'boot:ready') onBoot = callback; },
      on() { return () => {}; },
    },
    messages: {
      decorate(callback) { decorate = callback; return () => {}; },
      forEachVisible() {},
    },
    log: { warn() {} },
  };
  const document = {
    createElementNS(_namespace, tag) { return element(tag); },
    querySelectorAll() { return []; },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/091-custom-badge.js'), 'utf8');
  vm.runInNewContext(source, { YM, document, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {} });
  assert.equal(typeof onBoot, 'function', 'badge registers its boot callback');
  onBoot();
  return { decorate };
}

test('owner gets a crown, contributor gets a star, and unmapped users get no STAFF badge', () => {
  const { decorate } = loadBadge();
  const cases = [
    ['e46be3da-39b3-4a1a-b003-042d27d71e9d', 'owner', 'YapCord Owner', 'M3 7', 'none'],
    ['fc529a6a-ddbd-445b-8bce-18a13acca5d0', 'contributor', 'YapCord Contributor', 'M12 3', 'currentColor'],
  ];

  for (const [userId, role, label, pathStart, fill] of cases) {
    const name = element();
    const message = { author_id: userId };
    decorate({ el: { querySelector() { return name; } }, message });

    const badge = name.querySelector(':scope > .ym-custom-role-badge');
    assert.ok(badge, `${role} badge is rendered`);
    assert.equal(badge.getAttribute('data-ym-role'), role);
    assert.equal(badge.getAttribute('title'), label);
    assert.equal(badge.getAttribute('aria-label'), label);
    assert.equal(badge.children.length, 1, 'badge contains an icon rather than text');
    const [icon] = badge.children;
    assert.equal(icon.tagName, 'svg');
    assert.equal(icon.children[0].getAttribute('fill'), fill);
    assert.ok(icon.children[0].getAttribute('d').startsWith(pathStart));

    decorate({ el: { querySelector() { return name; } }, message: { author_id: 'unmapped-user-id' } });
    assert.equal(name.querySelector(':scope > .ym-custom-role-badge'), null, 'unmapped users get no role badge');
  }
});
