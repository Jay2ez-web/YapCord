// CustomCommands (port): your own slash commands / tags. Type /name (and maybe some words) and the message that is sent is the text you set.
(function () {
  /** "/greet bob" + [{ name: 'greet', text: 'Hello {args}!' }] -> "Hello bob!"; null when it is not one of yours. */
  function expand(content, commands, vars = {}) {
    const m = /^\/([A-Za-z0-9_-]{1,32})(?:\s+([\s\S]*))?$/.exec(String(content || '').trim());
    if (!m) return null;
    const cmd = (commands || []).find((c) => c && c.name && String(c.name).replace(/^\//, '').toLowerCase() === m[1].toLowerCase());
    if (!cmd) return null;
    const args = (m[2] || '').trim();
    const parts = args ? args.split(/\s+/) : [];
    const dict = { args, user: vars.user || '', channel: vars.channel || '', date: vars.date || '', time: vars.time || '' };
    return String(cmd.text || '')
      .replace(/\{\{?\s*(args|user|channel|date|time)\s*\}?\}/gi, (_, k) => dict[k.toLowerCase()])
      .replace(/\$(\d)/g, (_, n) => parts[Number(n) - 1] || '')
      .trim();
  }

  function context() {
    const now = new Date();
    const s = YM.Store.getState();
    const ch = s && s.channels[s.activeChannelId];
    return { user: YM.Store.me() ? YM.Store.me().display_name || YM.Store.me().username : '', channel: ch ? ch.name || '' : '', date: now.toLocaleDateString(), time: now.toLocaleTimeString() };
  }

  YM.definePlugin({
    name: 'CustomCommands',
    description: 'Make your own slash commands: /name sends a text you wrote. Use {args} for the words after the command, $1 $2 for single words, {user}, {channel}, {date} and {time}.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Utility'],
    api: { expand },
    options: {
      commands: {
        type: 'custom',
        default: [{ name: 'shrug', text: '¯\\_(ツ)_/¯ {args}' }],
        render(container, plugin) {
          const h = YM.dom.h;
          const list = h('div', { class: 'ym-tr-list' });
          const rows = () => (Array.isArray(plugin.settings.store.commands) ? plugin.settings.store.commands.map((r) => ({ ...r })) : []);
          const save = (next) => plugin.settings.set('commands', next);
          const draw = () => {
            list.replaceChildren();
            const cur = rows();
            if (!cur.length) list.append(h('div', { class: 'ym-hint' }, 'No commands yet.'));
            cur.forEach((r, i) => list.append(h('div', { class: 'ym-tr-row' },
              h('input', { class: 'ym-input', placeholder: 'name (without /)', value: r.name || '', style: { maxWidth: '140px' }, onChange: (e) => { const n = rows(); n[i].name = e.target.value.replace(/^\//, '').trim(); save(n); } }),
              h('input', { class: 'ym-input', placeholder: 'Text to send', value: r.text || '', onChange: (e) => { const n = rows(); n[i].text = e.target.value; save(n); } }),
              h('button', { class: 'ym-btn ym-btn-small ym-btn-danger', type: 'button', onClick: () => { const n = rows(); n.splice(i, 1); save(n); draw(); } }, 'Remove'))));
          };
          container.append(list, h('button', { class: 'ym-btn ym-btn-small', type: 'button', onClick: () => { save([...rows(), { name: '', text: '' }]); draw(); } }, 'Add command'));
          container.style.flexDirection = 'column';
          container.style.alignItems = 'stretch';
          draw();
        },
      },
    },
    start(ctx) {
      ctx.cleanup(YM.messageEvents.addPreSendListener((msg) => {
        const out = expand(msg.content, ctx.settings.store.commands, context());
        if (out !== null && out !== '') msg.content = out;
      }));
      ctx.css('.ym-tr-list{display:flex;flex-direction:column;gap:6px;width:100%}.ym-tr-row{display:flex;gap:6px;align-items:center}.ym-tr-row .ym-input{flex:1}');
    },
  });
})();
