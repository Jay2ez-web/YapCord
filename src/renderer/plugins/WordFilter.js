// WordFilter: hide swear words, words you never want to see, and messages from people you muted, on YOUR screen only.
// Nothing is deleted or reported and other people still see everything: this is a filter for your own eyes, not a server auto mod.
//
// How: words are covered with the browser's CSS Custom Highlight API (blurred or a solid bar), so Yapper's own text is never
// changed. A whole message can also be collapsed. Click a covered message to look at it anyway.
(function () {
  const BASE = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'piss', 'slut', 'whore', 'motherfucker', 'bullshit'];
  const LOOK = { a: '[a@4]', b: '[b8]', e: '[e3]', g: '[g9]', i: '[i1!|]', l: '[l1|]', o: '[o0]', s: '[s$5]', t: '[t7+]', u: '[uv]' };
  const esc = (c) => c.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&'); // no "-": outside a class it is plain, and "\\-" is an error with the u flag

  /** A word as a pattern: letters may repeat, look-alike characters (f*ck is not covered, f4ck and sh1t are) count too. */
  function wordPattern(word, lookalikes) {
    const chars = Array.from(String(word).toLowerCase().trim()).filter((c) => c.trim());
    if (!chars.length) return '';
    return chars.map((c) => {
      const cls = lookalikes && LOOK[c] ? LOOK[c] : esc(c);
      return '(?:' + cls + ')+';
    }).join('[\\s._-]{0,1}');
  }

  function splitList(text) {
    return String(text || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 500);
  }

  /** The regular expression for the words (null when there are none). Whole words only, so "class" is never hit by "ass". */
  function compile(words, lookalikes) {
    const parts = [...new Set(words.map((w) => wordPattern(w, lookalikes)).filter(Boolean))];
    if (!parts.length) return null;
    return new RegExp('(?<![\\p{L}\\p{N}])(?:' + parts.join('|') + ')(?![\\p{L}\\p{N}])', 'giu');
  }

  YM.definePlugin({
    name: 'WordFilter',
    description: 'Hide swear words, words you choose and people you muted on your own screen: blurred, as a bar, or the whole message collapsed. Click to look anyway.',
    authors: ['YapCord'],
    tags: ['Chat', 'Privacy', 'Customisation'],
    api: { compile, splitList, wordPattern, BASE },
    options: {
      mode: {
        type: 'select', default: 'blur', description: 'What to do with a message that has a filtered word',
        options: [{ label: 'Blur the word', value: 'blur' }, { label: 'Cover the word with a bar', value: 'bar' }, { label: 'Collapse the whole message', value: 'hide' }],
      },
      common: { type: 'boolean', default: true, description: 'Filter common swear words' },
      words: { type: 'string', default: '', description: 'Extra words to filter (separate with commas)' },
      lookalikes: { type: 'boolean', default: true, description: 'Also catch look-alikes such as sh1t and f4ck' },
      users: { type: 'string', default: '', description: 'Usernames to hide completely (separate with commas)' },
      notifications: { type: 'boolean', default: true, description: 'Also silence desktop notifications that contain a filtered word' },
    },
    start(ctx) {
      const supported = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function';
      let re = null;
      let muted = new Set();
      const open = new WeakSet();

      const rebuild = () => {
        const s = ctx.settings.store;
        const words = [...(s.common ? BASE : []), ...splitList(s.words)];
        try { re = compile(words, !!s.lookalikes); } catch (e) { re = null; YM.log && YM.log.warn && YM.log.warn('WordFilter: could not build the filter', e); }
        muted = new Set(splitList(s.users).map((u) => u.replace(/^@/, '').toLowerCase()));
      };
      const hasWord = (text) => { if (!re || !text) return false; re.lastIndex = 0; return re.test(text); };

      ctx.css(`
::highlight(ym-wf-blur){color:transparent;text-shadow:0 0 7px rgba(225,225,232,.95)}
::highlight(ym-wf-bar){color:transparent;background-color:#6b6d79}
.msg[data-ym-wf="hide"]:not([data-ym-wf-open]) > .msg-body > :not(.msg-head),.msg[data-ym-wf="hide"]:not([data-ym-wf-open]) > .msg-actions{display:none!important}
.msg[data-ym-wf="hide"]:not([data-ym-wf-open]) > .msg-body::after{content:"Hidden by your filter. Click to show.";display:block;font-size:12px;color:var(--text-faint,#6e6f7b);padding:2px 0}
.msg[data-ym-wf]{cursor:pointer}
`);

      const apply = () => {
        const s = ctx.settings.store;
        const ranges = { blur: [], bar: [] };
        for (const row of document.querySelectorAll(YM.messages.selector)) {
          const info = YM.messages.info(row);
          const msg = info && info.message;
          const author = msg && YM.Store.profile(msg.author_id);
          const mutedUser = !!author && muted.has(String(author.username || '').toLowerCase());
          let flagged = mutedUser;
          const holders = row.querySelectorAll('.msg-text, .reply-preview');
          const found = [];
          if (!mutedUser && re) {
            for (const el of holders) {
              const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                re.lastIndex = 0;
                for (let m = re.exec(n.data); m; m = re.exec(n.data)) {
                  found.push([n, m.index, m.index + m[0].length]);
                  if (!m[0].length) re.lastIndex++;
                }
              }
            }
            flagged = found.length > 0;
          }
          if (flagged && msg && msg.author_id === YM.Store.myId()) flagged = false; // never cover what you wrote yourself
          if (!flagged) {
            row.removeAttribute('data-ym-wf');
            row.removeAttribute('data-ym-wf-open');
            continue;
          }
          const mode = mutedUser ? 'hide' : s.mode;
          if (row.getAttribute('data-ym-wf') !== mode) row.setAttribute('data-ym-wf', mode);
          if (mode === 'hide' || open.has(row)) { if (open.has(row)) row.setAttribute('data-ym-wf-open', '1'); continue; }
          row.removeAttribute('data-ym-wf-open');
          for (const [node, a, b] of found) {
            const r = new Range();
            r.setStart(node, a);
            r.setEnd(node, b);
            ranges[mode === 'bar' ? 'bar' : 'blur'].push(r);
          }
        }
        if (supported) {
          CSS.highlights.set('ym-wf-blur', new Highlight(...ranges.blur));
          CSS.highlights.set('ym-wf-bar', new Highlight(...ranges.bar));
        }
      };

      const onClick = (e) => {
        const row = e.target instanceof Element ? e.target.closest('.msg[data-ym-wf]') : null;
        if (!row || e.target.closest('a,button,input,textarea')) return;
        if (open.has(row)) open.delete(row); else open.add(row);
        if (!open.has(row)) row.removeAttribute('data-ym-wf-open');
        apply();
      };
      document.addEventListener('click', onClick, true);

      rebuild();
      apply();
      ctx.onMutate(apply);
      ctx.on('store:change', (st, prev) => { if (st.profiles !== prev.profiles) apply(); });
      ctx.cleanup(ctx.settings.onChange(() => { rebuild(); apply(); }));
      ctx.cleanup(() => {
        document.removeEventListener('click', onClick, true);
        if (supported) { CSS.highlights.delete('ym-wf-blur'); CSS.highlights.delete('ym-wf-bar'); }
        document.querySelectorAll('.msg[data-ym-wf]').forEach((r) => { r.removeAttribute('data-ym-wf'); r.removeAttribute('data-ym-wf-open'); });
      });

      // Desktop notifications with a filtered word stay quiet.
      ctx.cleanup(YM.media.onNotification((title, options) => {
        if (!ctx.settings.store.notifications) return undefined;
        const text = String((options && options.body) || '') + ' ' + String(title || '');
        if (hasWord(text)) return false;
        return undefined;
      }));
    },
  });
})();
