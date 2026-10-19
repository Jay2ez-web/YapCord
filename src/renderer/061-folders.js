// Tracks Yapper's server folders. They live in Yapper's own (unexported) store, so we read the same data it
// loads/saves: GET/POST of /rest/v1/user_server_folders  ->  { folders: [{ id, name, color, servers: [serverId] }] }.

const listeners = new Set();
let folders = [];
let pending = null;

function normalize(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !Array.isArray(f.servers)) continue;
    const servers = f.servers.filter((s) => typeof s === 'string');
    if (servers.length) out.push({ id: f.id, name: typeof f.name === 'string' ? f.name : null, color: typeof f.color === 'string' ? f.color : null, servers });
  }
  return out;
}

function set(next) {
  folders = next;
  for (const fn of [...listeners]) {
    try {
      fn(folders);
    } catch (err) {
      YM.log.error('folder listener failed', err);
    }
  }
  YM.Events.emit('folders:change', folders);
}

YM.folders = {
  list: () => folders,
  folderOfServer: (serverId) => folders.find((f) => f.servers.includes(serverId)) || null,
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

YM.net.onFetch({
  test: (url) => /\/rest\/v1\/user_server_folders(\?|$)/.test(url),
  before(ctx) {
    if (ctx.method === 'POST' || ctx.method === 'PATCH') {
      const row = Array.isArray(ctx.json) ? ctx.json[0] : ctx.json;
      pending = row && Array.isArray(row.folders) ? normalize(row.folders) : null;
    }
  },
  async after(ctx, res) {
    if (ctx.method === 'GET') {
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const row = Array.isArray(data) ? data[0] : data;
      set(normalize(row && row.folders));
    } else if (pending) {
      if (res.ok) set(pending);
      pending = null;
    }
  },
});
