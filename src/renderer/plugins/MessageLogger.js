// MessageLogger (port of Vencord's plugin): keeps deleted messages visible and shows the history of edited messages.
// The log lives in memory only (like Vencord): it is cleared when the page reloads.
//
// How it works on Yapper:
//  - edits: diff of the store's message lists (a message whose `edited_at` changed and whose `content` differs)
//  - deletes: Yapper dispatches `yapper:message-removed` after removing a message; the previous store state has
//    the message, so we put a copy back (flagged __ymDeleted) with upsertMessages, which sorts it into place.

(function () {
  const MAX_EDITS = 500;
  const MAX_GHOSTS = 300;

  function parseList(str) {
    return new Set(String(str || '').split(/[\s,;]+/).filter(Boolean));
  }

  function isBotMessage(msg, profile) {
    if (msg.webhook) return true;
    if (!profile) return false;
    return !!(profile.is_bot || profile.bot || (Array.isArray(profile.badges) && profile.badges.includes('bot')));
  }

  const state = { edits: new Map(), ghosts: new Map() };

  const plugin = YM.definePlugin({
    name: 'MessageLogger',
    description: 'Keeps deleted messages on screen and shows what edited messages said before. Cleared when you reload.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Utility'],
    enabledByDefault: true,
    options: {
      logDeletes: { type: 'boolean', default: true, description: 'Keep deleted messages visible (marked as deleted)' },
      logEdits: { type: 'boolean', default: true, description: 'Show earlier versions of edited messages' },
      deleteStyle: {
        type: 'select',
        default: 'text',
        description: 'How deleted messages are marked',
        options: [
          { label: 'Red text', value: 'text' },
          { label: 'Red overlay', value: 'overlay' },
        ],
      },
      ignoreSelf: { type: 'boolean', default: false, description: "Don't log my own messages" },
      ignoreBots: { type: 'boolean', default: false, description: "Don't log bots and webhooks" },
      ignoreUsers: { type: 'string', default: '', description: 'User IDs to ignore (comma separated)' },
      ignoreChannels: { type: 'string', default: '', description: 'Channel IDs to ignore (comma separated)' },
      log: {
        type: 'custom',
        render(container) {
          const h = YM.dom.h;
          const info = h('span', { class: 'ym-hint' });
          const update = () => {
            info.textContent = `${YM.util.pluralize(state.ghosts.size, 'deleted message')}, ${YM.util.pluralize(state.edits.size, 'edited message')} logged`;
          };
          update();
          container.append(
            info,
            h('button', {
              class: 'ym-btn ym-btn-small',
              onClick: () => {
                if (plugin.api) plugin.api.clear();
                update();
              },
            }, 'Clear log'),
          );
        },
      },
    },

    async start(ctx) {
      const S = YM.Store;
      const settings = ctx.settings.store;
      await S.ready;
      if (!YM.plugins.isRunning('MessageLogger')) return;

      const removedCandidates = new Map(); // id -> message as it was before the removal

      function ignored(msg) {
        if (!msg) return true;
        if (settings.ignoreSelf && msg.author_id === S.myId()) return true;
        if (settings.ignoreBots && isBotMessage(msg, S.profile(msg.author_id))) return true;
        if (parseList(settings.ignoreUsers).has(msg.author_id)) return true;
        if (parseList(settings.ignoreChannels).has(msg.channel_id)) return true;
        return false;
      }

      function applyStyleClass() {
        document.documentElement.classList.toggle('ym-ml-overlay', settings.deleteStyle === 'overlay');
        document.documentElement.classList.toggle('ym-ml-text', settings.deleteStyle !== 'overlay');
      }
      applyStyleClass();
      ctx.cleanup(() => document.documentElement.classList.remove('ym-ml-overlay', 'ym-ml-text'));
      ctx.cleanup(ctx.settings.onChange((key) => {
        if (key === 'deleteStyle') applyStyleClass();
        YM.messages.refresh();
      }));

      // ---- store diff: edits + removal candidates --------------------------------------------
      ctx.on('store:change', (next, prev) => {
        if (next.messages === prev.messages) return;
        for (const channelId of Object.keys(next.messages)) {
          const a = prev.messages[channelId];
          const b = next.messages[channelId];
          if (a === b || !a || !b) continue;
          // Incoming messages normally append without changing existing objects. Avoid allocating a full Map and Set
          // for that hot path; the diff below is only needed for edits, removals, and non-append resyncs.
          if (b.length > a.length) {
            let appendOnly = true;
            for (let i = 0; i < a.length; i++) {
              if (a[i] !== b[i]) { appendOnly = false; break; }
            }
            if (appendOnly) continue;
          }
          const before = new Map();
          for (const m of a) before.set(m.id, m);
          const stillThere = new Set();
          for (const m of b) {
            stillThere.add(m.id);
            const old = before.get(m.id);
            if (
              old && settings.logEdits && !old.__ymDeleted && typeof old.content === 'string' && typeof m.content === 'string' &&
              m.content !== old.content && m.edited_at && m.edited_at !== old.edited_at && !ignored(old)
            ) {
              const list = state.edits.get(m.id) || [];
              if (!list.length || list[list.length - 1].content !== old.content) {
                list.push({ content: old.content, at: m.edited_at });
                state.edits.set(m.id, list);
                if (state.edits.size > MAX_EDITS) state.edits.delete(state.edits.keys().next().value);
              }
            }
          }
          if (settings.logDeletes && a.length > b.length) {
            for (const m of a) {
              if (!stillThere.has(m.id) && !m.__ymDeleted && !m.pending && !m.failed) removedCandidates.set(m.id, m);
            }
            if (removedCandidates.size > 200) removedCandidates.delete(removedCandidates.keys().next().value);
          }
        }
      });

      // ---- Yapper confirms a deletion -----------------------------------------------------------
      function onRemoved(ev) {
        const id = ev && ev.detail;
        const msg = removedCandidates.get(id);
        removedCandidates.delete(id);
        if (!msg || !settings.logDeletes || ignored(msg)) return;
        const ghost = { ...msg, __ymDeleted: true, __ymDeletedAt: new Date().toISOString() };
        delete ghost.pending;
        delete ghost.failed;
        state.ghosts.set(id, ghost);
        if (state.ghosts.size > MAX_GHOSTS) state.ghosts.delete(state.ghosts.keys().next().value);
        setTimeout(() => restore(ghost), 0); // after Yapper's own handler has finished
      }
      window.addEventListener('yapper:message-removed', onRemoved);
      ctx.cleanup(() => window.removeEventListener('yapper:message-removed', onRemoved));

      function restore(ghost) {
        try {
          S.api.upsertMessages(ghost.channel_id, [ghost]);
        } catch (err) {
          ctx.log.warn('could not restore deleted message', err);
        }
      }

      // A reload/resync of a channel drops our copies again: put them back (only inside the loaded window).
      let ensureQueued = false;
      ctx.on('store:change', (next, prev) => {
        if (next.messages === prev.messages || !state.ghosts.size || ensureQueued) return;
        ensureQueued = true;
        setTimeout(() => {
          ensureQueued = false;
          const st = S.getState();
          for (const g of state.ghosts.values()) {
            const list = st.messages[g.channel_id];
            if (list && list.length && g.created_at >= list[0].created_at && !list.some((m) => m.id === g.id)) restore(g);
          }
        }, 120);
      });

      // ---- decoration ----------------------------------------------------------------------
      const h = YM.dom.h;
      ctx.cleanup(YM.messages.decorate(({ el, id, body, textEl }) => {
        if (!body) return;
        const msg = S.findMessage(id);
        const isGhost = !!(msg && msg.__ymDeleted) || state.ghosts.has(id);
        const mark = el.querySelector(':scope > .ym-ghost-mark');
        if (isGhost && !mark) el.append(h('span', { class: 'ym-ghost-mark', hidden: true }));
        else if (!isGhost && mark) mark.remove();

        const tag = body.querySelector(':scope > .ym-ml-tag');
        if (isGhost && !tag) {
          body.append(h('div', { class: 'ym-ml-tag' },
            h('span', {}, 'Deleted'),
            h('button', {
              class: 'ym-link',
              title: 'Remove this message from the log',
              onClick: (e) => {
                e.stopPropagation();
                state.ghosts.delete(id);
                try { S.api.removeMessage(id); } catch (_) { /* already gone */ }
              },
            }, 'remove from log')));
        } else if (!isGhost && tag) tag.remove();

        const edits = settings.logEdits ? state.edits.get(id) : null;
        const box = body.querySelector(':scope > .ym-ml-edits');
        if (!edits || !edits.length) {
          if (box) box.remove();
          return;
        }
        if (box && box.dataset.count === String(edits.length)) return;
        const fresh = h('div', { class: 'ym-ml-edits', dataset: { count: edits.length } },
          edits.map((e) => h('div', { class: 'ym-ml-edit', title: 'Edited ' + YM.util.formatDateTime(e.at) }, e.content)));
        if (box) box.replaceWith(fresh);
        else if (textEl && textEl.parentNode === body) textEl.after(fresh);
        else body.append(fresh);
      }));

      plugin.api = {
        clear() {
          for (const id of [...state.ghosts.keys()]) {
            try { S.api.removeMessage(id); } catch (_) { /* ignore */ }
          }
          state.ghosts.clear();
          state.edits.clear();
          YM.messages.refresh();
        },
      };
      ctx.cleanup(() => {
        document.querySelectorAll('.ym-ghost-mark,.ym-ml-tag,.ym-ml-edits').forEach((n) => n.remove());
        plugin.api = null;
      });

      ctx.css(`
.msg:has(> .ym-ghost-mark) .msg-actions{display:none!important}
.ym-ml-text .msg:has(> .ym-ghost-mark) .msg-text,.ym-ml-text .msg:has(> .ym-ghost-mark) .msg-text *{color:var(--danger)!important}
.ym-ml-overlay .msg:has(> .ym-ghost-mark){background:color-mix(in srgb,var(--danger) 14%,transparent)!important;box-shadow:inset 3px 0 0 var(--danger)}
.ym-ml-tag{margin-top:2px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--danger);display:flex;gap:8px;align-items:center}
.ym-ml-tag .ym-link{all:unset;cursor:pointer;font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-muted);text-decoration:underline}
.ym-ml-tag .ym-link:hover{color:var(--text)}
.ym-ml-edits{margin-top:2px;display:flex;flex-direction:column;gap:1px}
.ym-ml-edit{font-size:13px;color:var(--text-faint,#6e6f7b);white-space:pre-wrap;overflow-wrap:anywhere;opacity:.9}
.ym-ml-edit:before{content:"\\21AA  "}
`);
      YM.messages.refresh();
    },
  });
})();
