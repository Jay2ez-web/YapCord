// Small helpers about people, shared by plugins: Yapper's own name colour / avatar functions, and finding a profile by the name shown on screen.

const people = (YM.people = {});
const lazyNames = YM.finder.lazy(['nameColor', 'colorRole', 'nameStyle', 'displayName']);
const lazyUrl = YM.finder.lazy(['publicUrl']);

/** The colour Yapper itself gives this person's name in a server (a CSS colour string), or null. */
people.nameColor = (userId, serverId) => {
  const mod = lazyNames();
  const s = YM.Store.getState();
  if (!mod || !s || !userId) return null;
  try {
    return mod.nameColor(s, serverId, userId) || null;
  } catch (_) {
    return null;
  }
};

/** Role of the person that gives the name its colour (it has color and maybe color2), or null. */
people.colorRole = (userId, serverId) => {
  const mod = lazyNames();
  const s = YM.Store.getState();
  if (!mod || !s || !userId) return null;
  try {
    return mod.colorRole(s, serverId, userId) || null;
  } catch (_) {
    return null;
  }
};

people.avatarUrl = (profile) => {
  const mod = lazyUrl();
  return profile && profile.avatar_path && mod ? mod.publicUrl('avatars', profile.avatar_path) || null : null;
};

const profileNameIndexes = new WeakMap();

function nameIndex(profiles) {
  let index = profileNameIndexes.get(profiles);
  if (index) return index;
  const username = new Map();
  const display = new Map();
  const add = (map, rawName, profile) => {
    const key = String(rawName || '').trim().toLowerCase();
    if (!key) return;
    if (!map.has(key)) map.set(key, profile);
    else if (map.get(key) !== profile) map.set(key, null); // ambiguous names must not resolve to a random user
  };
  for (const profile of Object.values(profiles)) {
    if (!profile) continue;
    add(username, profile.username, profile);
    add(display, profile.display_name, profile);
  }
  index = { username, display };
  profileNameIndexes.set(profiles, index);
  return index;
}

/** Finds the profile of someone from the name on screen: username first, then display name. Null when it is not unique. */
people.byName = (name) => {
  const s = YM.Store.getState();
  if (!s || !name || !s.profiles || typeof s.profiles !== 'object') return null;
  const want = String(name).trim().replace(/^@/, '').toLowerCase();
  if (!want) return null;
  const index = nameIndex(s.profiles);
  return index.username.get(want) || index.display.get(want) || null;
};

/** Server the person is looking at (of the open channel), or null in a DM. */
people.currentServerId = () => {
  const s = YM.Store.getState();
  if (!s) return null;
  const ch = s.channels[s.activeChannelId];
  return (ch && ch.server_id) || s.activeServerId || null;
};

/** Which server a button in the server list belongs to (null when it cannot be told). Uses Yapper's own React data first, then the folder row, then a unique name. */
people.serverIdOf = (el) => {
  const s = YM.Store.getState();
  const servers = (s && s.servers) || {};
  for (const k in el) {
    if (!k.startsWith('__reactFiber$')) continue;
    const fiber = el[k];
    const kids = fiber && fiber.memoizedProps && fiber.memoizedProps.children;
    for (const kid of Array.isArray(kids) ? kids : [kids]) {
      const sv = kid && kid.props && kid.props.server;
      if (sv && sv.id) return sv.id;
    }
    for (let c = fiber && fiber.child, depth = 0; c && depth < 3; c = c.child, depth++) {
      const sv = c.memoizedProps && c.memoizedProps.server;
      if (sv && sv.id) return sv.id;
    }
  }
  const row = el.closest && el.closest('[data-rail-row]');
  if (row && row.dataset.railRow && servers[row.dataset.railRow]) return row.dataset.railRow;
  const title = el.getAttribute && (el.getAttribute('title') || el.getAttribute('aria-label'));
  if (title) {
    const same = Object.values(servers).filter((sv) => sv && sv.name === title);
    if (same.length === 1) return same[0].id;
  }
  return null;
};
