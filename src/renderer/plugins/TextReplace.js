// TextReplace (port): replace text in messages as you send them. Plain text or regular expressions.
(function () {
  function applyRules(content, rules) {
    let out = content;
    for (const r of rules || []) {
      if (!r || !r.find) continue;
      try {
        if (r.regex) out = out.replace(new RegExp(r.find, 'g'), String(r.replace ?? ''));
        else out = out.split(r.find).join(String(r.replace ?? ''));
      } catch (_) { /* invalid pattern: skip rule */ }
    }
    return out;
  }

  YM.definePlugin({
    name: 'TextReplace',
    description: 'Replaces text in the messages you send (for example "shrug" -> a shrug emoticon). Supports regular expressions.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Utility'],
    api: { applyRules },
    options: {
      rules: {
        type: 'custom',
        default: [],
        render(container, plugin) {
          const h = YM.dom.h;
          const list = h('div', { class: 'ym-tr-list' });
          const rules = () => (Array.isArray(plugin.settings.store.rules) ? plugin.settings.store.rules.map((r) => ({ ...r })) : []);
          const save = (next) => plugin.settings.set('rules', next);
          const draw = () => {
            list.replaceChildren();
            const cur = rules();
            if (!cur.length) list.append(h('div', { class: 'ym-hint' }, 'No rules yet.'));
            cur.forEach((r, i) => list.append(h('div', { class: 'ym-tr-row' },
              h('input', { class: 'ym-input', placeholder: 'Find', value: r.find || '', onChange: (e) => { const n = rules(); n[i].find = e.target.value; save(n); } }),
              h('input', { class: 'ym-input', placeholder: 'Replace with', value: r.replace || '', onChange: (e) => { const n = rules(); n[i].replace = e.target.value; save(n); } }),
              h('label', { class: 'ym-hint' }, h('input', { type: 'checkbox', checked: !!r.regex, onChange: (e) => { const n = rules(); n[i].regex = e.target.checked; save(n); } }), ' regex'),
              h('button', { class: 'ym-btn ym-btn-small ym-btn-danger', type: 'button', onClick: () => { const n = rules(); n.splice(i, 1); save(n); draw(); } }, 'Remove'))));
          };
          container.append(list, h('button', { class: 'ym-btn ym-btn-small', type: 'button', onClick: () => { save([...rules(), { find: '', replace: '', regex: false }]); draw(); } }, 'Add rule'));
          container.style.flexDirection = 'column';
          container.style.alignItems = 'stretch';
          draw();
        },
      },
    },
    start(ctx) {
      const handler = (msg) => { msg.content = applyRules(msg.content, ctx.settings.store.rules); };
      ctx.cleanup(YM.messageEvents.addPreSendListener(handler));
      ctx.cleanup(YM.messageEvents.addPreEditListener(handler));
      ctx.css('.ym-tr-list{display:flex;flex-direction:column;gap:6px;width:100%}.ym-tr-row{display:flex;gap:6px;align-items:center}.ym-tr-row .ym-input{flex:1}');
    },
  });
})();
