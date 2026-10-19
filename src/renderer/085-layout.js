// Layout: choose where the three main columns sit (server list, channel / DM list, chat) and how big things are.
// It is done with CSS only (flex "order" and a few sizes), so nothing of Yapper's page is moved or rewritten and "Reset" brings the
// original layout back exactly. On a narrow window (Yapper's own one-column layout, under 761px) the column order is left alone.
// Settings: layout = { order: ['rail','sidebar','main'], railIcon, sidebarWidth, zoom, chatText, messageGap } (see the Layout page).

const Layout = (YM.layout = {});

const PARTS = ['rail', 'sidebar', 'main'];
const DEFAULTS = Object.freeze({ order: ['rail', 'sidebar', 'main'], railIcon: 48, sidebarWidth: 260, zoom: 100, chatText: 100, messageGap: 100 });
const LIMITS = Object.freeze({ railIcon: [36, 72], sidebarWidth: [200, 420], zoom: [70, 160], chatText: [80, 150], messageGap: [40, 200] });
const PART_NAMES = Object.freeze({ rail: 'Servers', sidebar: 'Channels & DMs', main: 'Chat' });

/** A complete, valid layout from whatever is stored (missing, old or hand-edited values fall back to the defaults). */
function normalise(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULTS, order: [...DEFAULTS.order] };
  if (Array.isArray(r.order) && r.order.length === 3 && PARTS.every((p) => r.order.includes(p))) out.order = [...r.order];
  for (const k of Object.keys(LIMITS)) {
    const n = Number(r[k]);
    if (Number.isFinite(n)) out[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], Math.round(n)));
  }
  return out;
}

/** The CSS for a layout; '' when nothing differs from Yapper's own layout. */
function buildCss(cfg) {
  const c = normalise(cfg);
  const idx = (p) => c.order.indexOf(p);
  const wide = [];
  if (c.order.join() !== DEFAULTS.order.join()) {
    wide.push(`.app>.rail{order:${idx('rail') + 1}}.app>.sidebar{order:${idx('sidebar') + 1}}.app>.main{order:${idx('main') + 1}}`);
    // The line between the channel list and the chat sits on the side that faces the chat.
    if (idx('sidebar') > idx('main')) wide.push('.app>.sidebar{border-right:0;border-left:1px solid var(--border)}');
    // The little marker next to the open server sits on the outer edge: the right edge when the server list is on the right.
    if (idx('rail') === 2) wide.push('.app>.rail .rail-pill,.app>.rail .rail-wrap .rail-pill{left:auto;right:-12px;border-radius:4px 0 0 4px}');
  }
  if (c.railIcon !== DEFAULTS.railIcon) {
    const s = c.railIcon;
    wide.push(`.app>.rail{width:${s + 24}px}.app>.rail .rail-item:not(.big){width:${s}px;height:${s}px}.app>.rail .rail-item:not(.big):not(.rail-folder):not(:hover):not(.active){border-radius:${Math.round(s / 2)}px}`);
  }
  if (c.sidebarWidth !== DEFAULTS.sidebarWidth) wide.push(`.app>.sidebar{width:${c.sidebarWidth}px}`);
  const all = [];
  if (wide.length) all.push('@media (min-width:761px){' + wide.join('\n') + '}');
  if (c.chatText !== DEFAULTS.chatText) all.push(`.msg-text{font-size:calc(1em * ${(c.chatText / 100).toFixed(2)})}`);
  if (c.messageGap !== DEFAULTS.messageGap) all.push(`.msg:not(.grouped){margin-top:${Math.round((14 * c.messageGap) / 100)}px}`);
  return all.join('\n');
}

let cfg = normalise(YM.settings.get('layout'));
let appliedZoom = null;
let persistTimer = null;

function applyZoom() {
  const ui = YM.native && YM.native.ui;
  if (!ui || typeof ui.setZoom !== 'function') return;
  if (appliedZoom === null && cfg.zoom === DEFAULTS.zoom) return; // never touched: leave Chromium's own zoom alone
  if (appliedZoom === cfg.zoom) return;
  appliedZoom = cfg.zoom;
  try {
    const p = ui.setZoom(cfg.zoom);
    if (p && typeof p.catch === 'function') p.catch((err) => YM.log.warn('could not set the zoom', err));
  } catch (err) {
    YM.log.warn('could not set the zoom', err);
  }
}

function apply() {
  YM.dom.css.set('layout', buildCss(cfg));
  applyZoom();
  YM.Events.emit('layout:change', cfg);
}

function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => YM.settings.set('layout', { ...cfg, order: [...cfg.order] }), 250);
}

Object.assign(Layout, {
  PARTS, DEFAULTS, LIMITS, PART_NAMES, normalise, buildCss, apply,
  get: () => ({ ...cfg, order: [...cfg.order] }),
  /** Change one value (a size, or "order" with an array). Applied at once, saved a moment later. */
  set(key, value) {
    cfg = normalise({ ...cfg, [key]: value });
    apply();
    persist();
  },
  /** Move a column one step to the left (-1) or right (+1). */
  move(part, dir) {
    const order = [...cfg.order];
    const i = order.indexOf(part);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    Layout.set('order', order);
  },
  reset() {
    cfg = normalise(null);
    apply();
    persist();
  },
});

// Changes that come from elsewhere (a second window): follow them.
YM.settings.onPath('layout', (v) => {
  const next = normalise(v);
  if (JSON.stringify(next) === JSON.stringify(cfg)) return;
  cfg = next;
  apply();
});

apply();
