// PreviewMessage (port): a "Preview" button next to the message box that shows how your message will look before you send it.
(function () {
  const h = (...a) => YM.dom.h(...a);

  // ---- a small Markdown renderer that builds DOM nodes (never HTML strings), covering what Yapper shows --------------------
  const INLINE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*\*([\s\S]+?)\*\*\*|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\|\|([\s\S]+?)\|\||\*([^*\n]+?)\*|(?<![\w])_([^_\n]+?)_(?![\w])|(https?:\/\/[^\s<]+[^\s<.,:;"')\]}!?])|<a?:([A-Za-z0-9_]{2,32}):([0-9a-f-]{36})>|@([A-Za-z0-9_.]{2,32})/g;

  function emojiNode(id, name) {
    const s = YM.Store.getState();
    const e = s && s.emojis && s.emojis[id];
    const mod = YM.finder.findExports(['publicUrl']);
    const url = e && mod ? mod.publicUrl('emojis', e.path) : null;
    return url ? h('img', { class: 'emoji', src: url, alt: ':' + name + ':', title: ':' + name + ':' }) : document.createTextNode(':' + name + ':');
  }

  function inline(text) {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(INLINE)) {
      if (m.index > last) out.push(text.slice(last, m.index));
      if (m[2] !== undefined) out.push(h('code', { class: 'md-code' }, m[2]));
      else if (m[3] !== undefined) out.push(h('strong', {}, h('em', {}, inline(m[3]))));
      else if (m[4] !== undefined) out.push(h('strong', {}, inline(m[4])));
      else if (m[5] !== undefined) out.push(h('u', {}, inline(m[5])));
      else if (m[6] !== undefined) out.push(h('s', {}, inline(m[6])));
      else if (m[7] !== undefined) out.push(h('span', { class: 'md-spoiler open' }, inline(m[7])));
      else if (m[8] !== undefined) out.push(h('em', {}, inline(m[8])));
      else if (m[9] !== undefined) out.push(h('em', {}, inline(m[9])));
      else if (m[10] !== undefined) out.push(h('a', { href: m[10], target: '_blank', rel: 'noopener noreferrer nofollow' }, m[10]));
      else if (m[12] !== undefined) out.push(emojiNode(m[12], m[11]));
      else if (m[13] !== undefined) {
        const exists = YM.people.byName(m[13]) || /^(everyone|here)$/i.test(m[13]);
        out.push(exists ? h('span', { class: 'mention' }, '@' + m[13]) : '@' + m[13]);
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  function block(text) {
    const lines = text.split('\n');
    const out = [];
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      let m;
      if ((m = /^(#{1,3})\s+(.+)$/.exec(line))) { out.push(h('div', { class: 'md-h md-h' + m[1].length }, inline(m[2]))); i++; continue; }
      if (/^> /.test(line)) {
        const q = [];
        while (i < lines.length && /^> /.test(lines[i])) q.push(lines[i++].slice(2));
        out.push(h('blockquote', { class: 'md-quote' }, block(q.join('\n'))));
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(h('li', {}, inline(lines[i++].replace(/^\s*[-*]\s+/, ''))));
        out.push(h('ul', { class: 'md-list' }, items));
        continue;
      }
      const para = [];
      while (i < lines.length && !/^(#{1,3}\s+.+|> .*|\s*[-*]\s+.+)$/.test(lines[i])) para.push(lines[i++]);
      out.push(h('div', {}, inline(para.join('\n'))));
    }
    return out;
  }

  /** Markdown text -> DOM nodes (fenced code blocks, headings, quotes, lists, inline styles, links, mentions, custom emojis). */
  function render(text) {
    const out = [];
    let last = 0;
    for (const m of String(text).matchAll(/```(?:[a-z0-9+-]*\n)?([\s\S]*?)```/gi)) {
      if (m.index > last) out.push(...block(text.slice(last, m.index)));
      out.push(h('pre', { class: 'md-pre' }, h('code', {}, m[1].replace(/\n$/, ''))));
      last = m.index + m[0].length;
      if (text[last] === '\n') last++;
    }
    if (last < text.length) out.push(...block(text.slice(last)));
    return out;
  }

  function open(text) {
    const value = String(text || '');
    const me = YM.Store.me();
    return YM.modal.open({
      title: 'Preview',
      subtitle: 'This is how your message will look. It has not been sent.',
      wide: true,
      body: value.trim()
        ? h('div', { class: 'ym-pm msg-text' }, h('div', { class: 'ym-pm-author' }, me ? me.display_name || me.username : 'You'), h('div', { class: 'ym-pm-text' }, render(value)))
        : h('div', { class: 'ym-hint' }, 'The message box is empty.'),
    });
  }

  YM.definePlugin({
    name: 'PreviewMessage',
    description: 'Adds a Preview button next to the message box that shows how your message will look (bold, quotes, code, links, mentions) without sending it.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Utility'],
    api: { render, open },
    start(ctx) {
      const EYE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
      const sync = () => {
        document.querySelectorAll('.composer .composer-tools').forEach((tools) => {
          if (tools.querySelector('.ym-pm-btn')) return;
          const box = tools.closest('.composer');
          tools.prepend(h('button', {
            type: 'button', class: 'icon-btn ym-pm-btn', title: 'Preview message', 'aria-label': 'Preview message', html: EYE,
            onClick: () => { const ta = box && box.querySelector('textarea'); open(ta ? ta.value : ''); },
          }));
        });
      };
      ctx.onMutate(sync);
      sync();
      ctx.cleanup(() => document.querySelectorAll('.ym-pm-btn').forEach((n) => n.remove()));
      ctx.css('.ym-pm{background:var(--bg-elev,rgba(255,255,255,.05));border-radius:10px;padding:12px 14px}.ym-pm-author{font-weight:700;margin-bottom:4px}.ym-pm-text{white-space:pre-wrap;word-break:break-word}.ym-pm .md-spoiler{background:rgba(255,255,255,.12);border-radius:4px;padding:0 3px}.ym-pm .md-pre{white-space:pre-wrap;margin:6px 0}.ym-pm img.emoji{width:22px;height:22px;vertical-align:-5px}');
    },
  });
})();
