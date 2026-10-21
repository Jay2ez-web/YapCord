// MoreUserTags: local role-derived labels for message authors in the current server.
// Inspired by Equicord MoreUserTags (GPL-3.0-or-later); rewritten for Yapper's loaded role/member maps.
(function () {
  const AUTHOR = ':scope > .msg-body > .msg-head > .msg-author:not(.webhook-author)';
  const CLASS = 'ym-more-user-tag';

  function rolesFor(state, serverId, userId) {
    const roles = state && state.roles && state.roles[serverId];
    const ids = state && state.memberRoles && state.memberRoles[serverId] && state.memberRoles[serverId][userId];
    if (!Array.isArray(roles) || !Array.isArray(ids)) return [];
    const set = new Set(ids);
    return roles.filter((role) => role && set.has(role.id));
  }

  function tagFor(state, serverId, userId, options = {}) {
    if (!state || !serverId || !userId) return null;
    const roles = rolesFor(state, serverId, userId);
    const has = (keys) => roles.some((role) => keys.some((key) => !!(role[key] || (role.perms && role.perms[key]))));
    if (options.admin !== false && has(['administrator'])) return { key: 'admin', label: 'ADMIN' };
    if (options.staff !== false && has(['manage_server', 'manage_channels', 'manage_roles'])) return { key: 'staff', label: 'STAFF' };
    if (options.moderator !== false && has(['manage_messages', 'kick_members', 'ban_members', 'timeout_members'])) return { key: 'moderator', label: 'MOD' };
    if (options.voice !== false && has(['move_members', 'mute_members', 'deafen_members'])) return { key: 'voice', label: 'VC MOD' };
    return null;
  }

  function serverIdFor(message) {
    const direct = message && (message.server_id || message.guild_id);
    if (direct) return direct;
    const channel = message && YM.Store.channel(message.channel_id || message.channelId);
    return channel && (channel.server_id || channel.guild_id) || null;
  }

  function decorate({ el, message }) {
    const name = el && el.querySelector(AUTHOR);
    if (!name) return;
    const existing = name.querySelector(':scope > .' + CLASS);
    const serverId = serverIdFor(message);
    const tag = message && tagFor(YM.Store.getState(), serverId, message.author_id || message.authorId, ctxSettings);
    if (!tag) { if (existing) existing.remove(); return; }
    if (existing && existing.getAttribute('data-tag') === tag.key && existing.textContent === tag.label) return;
    if (existing) existing.remove();
    name.append(YM.dom.h('span', { class: CLASS, 'data-tag': tag.key, title: 'YapCord role label: ' + tag.label, 'aria-label': tag.label }, tag.label));
  }

  let ctxSettings = {};
  YM.definePlugin({
    name: 'MoreUserTags',
    description: 'Shows local ADMIN, STAFF, MOD, or VC MOD labels beside message authors using roles Yapper has already loaded. Owners use the separate purple icon badge. This never changes server roles or permissions.',
    authors: ['YapCord adaptation; inspired by Equicord'],
    tags: ['Servers', 'Appearance'],
    enabledByDefault: true,
    api: { rolesFor, tagFor },
    options: {
      admin: { type: 'boolean', default: true, description: 'Show administrator labels.' },
      staff: { type: 'boolean', default: true, description: 'Show server management labels.' },
      moderator: { type: 'boolean', default: true, description: 'Show message and member moderation labels.' },
      voice: { type: 'boolean', default: true, description: 'Show voice moderation labels.' },
    },
    start(ctx) {
      ctxSettings = ctx.settings.store;
      ctx.cleanup(YM.messages.decorate(decorate));
      ctx.on('store:change', (state, prev) => {
        if (state.roles !== prev.roles || state.memberRoles !== prev.memberRoles || state.servers !== prev.servers || state.channels !== prev.channels || state.activeChannelId !== prev.activeChannelId) YM.messages.refresh();
      });
      ctx.cleanup(ctx.settings.onChange(() => { ctxSettings = ctx.settings.store; YM.messages.refresh(); }));
      ctx.cleanup(() => { ctxSettings = {}; document.querySelectorAll('.' + CLASS).forEach((node) => node.remove()); });
      ctx.css('.' + CLASS + '{display:inline-flex;align-items:center;vertical-align:middle;margin-left:.35em;padding:.13em .38em;border:1px solid rgba(174,137,255,.36);border-radius:4px;background:rgba(129,82,201,.18);color:#d9c1ff;font:700 .68em/1.25 system-ui,sans-serif;letter-spacing:.035em;white-space:nowrap}.ym-more-user-tag[data-tag="owner"]{color:#ffd782;border-color:rgba(255,215,130,.45);background:rgba(212,155,52,.14)}');
    },
  });
})();
