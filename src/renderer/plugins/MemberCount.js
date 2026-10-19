// MemberCount (port): shows the total number of members of the open server in the header of the member list.
// Yapper's own list only counts the people shown in each section ("Online - 12"); the server total comes from the store
// (`memberCounts[serverId]`, the same number Yapper uses to decide when a server is "large").
(function () {
  YM.definePlugin({
    name: 'MemberCount',
    description: 'Shows the total number of members of the server at the top of the member list.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Servers', 'Appearance'],
    options: {
      showOnline: { type: 'boolean', default: false, description: 'Also show how many members are online (counted from the members Yapper has loaded)' },
    },
    start(ctx) {
      const h = YM.dom.h;

      function total() {
        if (!YM.Store.isReady) return null;
        const st = YM.Store.getState();
        const id = st.activeServerId;
        const n = id && st.memberCounts ? st.memberCounts[id] : null;
        if (typeof n !== 'number' || !Number.isFinite(n)) return null;
        let text = n.toLocaleString();
        if (ctx.settings.store.showOnline) {
          // serverMembers[serverId] is a list of user ids; online[userId] is set for people who are online.
          const members = Array.isArray(st.serverMembers && st.serverMembers[id]) ? st.serverMembers[id] : [];
          const online = st.online || {};
          const me = st.myStatus === 'invisible' ? null : st.userId;
          let live = 0;
          for (const uid of new Set(members)) if (typeof uid === 'string' && (online[uid] || uid === me)) live++;
          text = live.toLocaleString() + ' online · ' + text;
        }
        return text;
      }

      function render() {
        const text = total();
        document.querySelectorAll('.members-panel > .side-panel-head').forEach((head) => {
          const title = head.firstElementChild;
          if (!title) return;
          const el = title.querySelector(':scope > .ym-membercount');
          if (text == null) {
            if (el) el.remove();
            return;
          }
          if (el) {
            if (el.textContent !== text) el.textContent = text;
          } else {
            title.append(h('span', { class: 'ym-membercount', title: 'Members in this server' }, text));
          }
        });
      }

      ctx.onMutate(render);
      ctx.on('store:change', (next, prev) => {
        if (next.memberCounts !== prev.memberCounts || next.activeServerId !== prev.activeServerId || next.online !== prev.online || next.serverMembers !== prev.serverMembers || next.myStatus !== prev.myStatus) render();
      });
      ctx.cleanup(ctx.settings.onChange(render));
      ctx.cleanup(() => document.querySelectorAll('.ym-membercount').forEach((n) => n.remove()));
      ctx.css('.ym-membercount{margin-left:8px;font-size:12px;font-weight:600;color:var(--text-muted);font-variant-numeric:tabular-nums}');
      render();
    },
  });
})();
