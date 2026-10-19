// ShikiCodeblocks (port, with its own small highlighter): code blocks in messages get syntax colours.
// Vencord's plugin uses the Shiki library with VS Code themes. Here a compact highlighter for the common languages does the job, and the
// colours are painted with the browser's CSS Custom Highlight API, so Yapper's own code block markup is never touched.
(function () {
  const words = (s) => new Set(s.split(/\s+/).filter(Boolean));
  const KW = {
    js: words('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await of static get set null undefined true false NaN Infinity from as enum interface type implements private public protected readonly abstract declare namespace module keyof'),
    py: words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda None nonlocal not or pass raise return try while with yield True False self match case'),
    c: words('auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class public private protected namespace using template typename new delete try catch throw virtual override final nullptr true false bool this operator string var foreach in is as null abstract sealed readonly interface base lock event delegate async await package import extends implements instanceof synchronized throws boolean byte'),
    go: words('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false iota'),
    rust: words('as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while'),
    sh: words('if then else elif fi for while do done case esac function in return export local echo cd exit set unset readonly source alias'),
    sql: words('select from where insert into values update set delete create table alter drop index join inner left right outer on group by order having limit offset as and or not null is in like between distinct union all primary key foreign references default unique constraint count sum avg min max case when then else end'),
    json: words('true false null'),
  };
  const ALIAS = {
    js: 'js', javascript: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', mjs: 'js', node: 'js',
    py: 'py', python: 'py', rb: 'py', ruby: 'py', yaml: 'py', yml: 'py', toml: 'py', ini: 'py',
    c: 'c', cpp: 'c', 'c++': 'c', h: 'c', cs: 'c', csharp: 'c', java: 'c', kotlin: 'c', kt: 'c', swift: 'c', dart: 'c', php: 'c', scala: 'c', lua: 'c',
    go: 'go', golang: 'go', rust: 'rust', rs: 'rust',
    sh: 'sh', bash: 'sh', zsh: 'sh', shell: 'sh', ps1: 'sh', powershell: 'sh', bat: 'sh', cmd: 'sh',
    sql: 'sql', mysql: 'sql', postgres: 'sql', sqlite: 'sql',
    json: 'json', jsonc: 'json', json5: 'json',
    html: 'html', xml: 'html', svg: 'html', vue: 'html',
    css: 'css', scss: 'css', less: 'css',
  };
  const HASH = new Set(['py', 'sh']);
  const SLASH = new Set(['js', 'c', 'go', 'rust', 'css']);

  function guess(code) {
    const t = code.trim();
    if (/^[{\[]/.test(t)) { try { JSON.parse(t); return 'json'; } catch (_) { /* not json */ } }
    if (/^<[!a-z/]/i.test(t)) return 'html';
    if (/^#include|\b(std::|int main)\b/.test(t)) return 'c';
    if (/^\s*(def |import |from \w+ import|class \w+.*:)/m.test(t) || /\bprint\(/.test(t) && /:\s*$/m.test(t)) return 'py';
    if (/\bfn \w+|let mut |impl\b/.test(t)) return 'rust';
    if (/^\s*(select|insert|update|delete|create)\b/im.test(t)) return 'sql';
    if (/^\s*(\$ |sudo |cd |echo |#!\/)/m.test(t)) return 'sh';
    if (/\b(function|const|let|=>|var|import .* from)\b/.test(t)) return 'js';
    return 'c';
  }

  /** @returns {{ type: string, start: number, end: number }[]} types: comment string number keyword function type tag attr prop */
  function tokenize(code, lang) {
    const fam = ALIAS[String(lang || '').toLowerCase()] || guess(code);
    const out = [];
    const push = (type, start, end) => { if (end > start) out.push({ type, start, end }); };
    if (fam === 'html') {
      const re = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w:-]*|\s([A-Za-z_:][\w:.-]*)(?==)|"[^"]*"|'[^']*'/g;
      for (const m of code.matchAll(re)) {
        if (m[0].startsWith('<!--')) push('comment', m.index, m.index + m[0].length);
        else if (m[0][0] === '<') push('tag', m.index, m.index + m[0].length);
        else if (m[1]) push('attr', m.index + m[0].length - m[1].length, m.index + m[0].length);
        else push('string', m.index, m.index + m[0].length);
      }
      return out;
    }
    const kw = KW[fam] || KW.js;
    const parts = [];
    if (SLASH.has(fam)) parts.push('\\/\\/[^\\n]*', '\\/\\*[\\s\\S]*?(?:\\*\\/|$)');
    if (HASH.has(fam)) parts.push('#[^\\n]*');
    if (fam === 'sql') parts.push('--[^\\n]*', '\\/\\*[\\s\\S]*?(?:\\*\\/|$)');
    const comment = parts.length ? '(' + parts.join('|') + ')' : '((?!))'; // (?!) never matches: an empty group would match everywhere
    const str = '("""[\\s\\S]*?(?:"""|$)|\'\'\'[\\s\\S]*?(?:\'\'\'|$)|"(?:\\\\.|[^"\\\\\\n])*"?|\'(?:\\\\.|[^\'\\\\\\n])*\'?|`(?:\\\\.|[^`\\\\])*`?)';
    const num = '(\\b0x[0-9a-fA-F]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[a-zA-Z%]*)';
    const hex = fam === 'css' ? '(#[0-9a-fA-F]{3,8}\\b)' : '((?!))';
    const word = '([A-Za-z_$@][\\w$-]*)';
    const re = new RegExp(comment + '|' + str + '|' + hex + '|' + num + '|' + word, 'g');
    for (const m of code.matchAll(re)) {
      const s = m.index;
      const e = s + m[0].length;
      if (m[1]) push('comment', s, e);
      else if (m[2]) {
        const after = code.slice(e).match(/^\s*:/);
        push(fam === 'json' && after ? 'prop' : 'string', s, e);
      } else if (m[3]) push('number', s, e);
      else if (m[4]) push('number', s, e);
      else if (m[5]) {
        const w = m[5];
        const check = fam === 'sql' ? w.toLowerCase() : w;
        if (fam === 'css') {
          if (w[0] === '@') push('keyword', s, e);
          else if (/^\s*:(?!:)/.test(code.slice(e, e + 40))) {
            const before = code.slice(0, s).trimEnd().slice(-1);
            if (before === '{' || before === ';' || before === '') push('prop', s, e);
          }
        } else if (kw.has(check)) push('keyword', s, e);
        else if (/^\s*\(/.test(code.slice(e, e + 3))) push('function', s, e);
        else if (/^[A-Z][A-Za-z0-9_]*$/.test(w) && w.length > 1) push('type', s, e);
      }
    }
    return out;
  }

  /** The language written after the three backticks, for each fenced block of a message, in order. */
  function fenceLanguages(content) {
    const langs = [];
    for (const m of String(content || '').matchAll(/```([a-z0-9+#-]*)\n?[\s\S]*?```/gi)) langs.push(m[1] || '');
    return langs;
  }

  const TYPES = ['comment', 'string', 'number', 'keyword', 'function', 'type', 'tag', 'attr', 'prop'];

  YM.definePlugin({
    name: 'ShikiCodeblocks',
    description: 'Adds syntax colours to code blocks in messages (JavaScript, Python, C-like languages, Go, Rust, shell, SQL, JSON, HTML, CSS...). Uses a small built-in highlighter, not the Shiki library.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Appearance'],
    api: { tokenize, fenceLanguages, guess },
    start(ctx) {
      if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') {
        ctx.log.warn('This browser has no CSS Custom Highlight API: code blocks stay plain.');
        return;
      }
      const sets = Object.fromEntries(TYPES.map((t) => [t, new Highlight()]));
      TYPES.forEach((t) => CSS.highlights.set('ym-c-' + t, sets[t]));
      let timer = 0;
      const paint = () => {
        timer = 0;
        TYPES.forEach((t) => sets[t].clear());
        document.querySelectorAll('pre.md-pre > code').forEach((code) => {
          const node = code.firstChild;
          if (!node || node.nodeType !== 3 || code.childNodes.length !== 1) return;
          const msg = code.closest('.msg[data-message-id]');
          let lang = '';
          if (msg) {
            const message = YM.Store.isReady ? YM.Store.findMessage(msg.getAttribute('data-message-id')) : null;
            const pres = [...msg.querySelectorAll('pre.md-pre')];
            if (message) lang = fenceLanguages(message.content)[pres.indexOf(code.parentElement)] || '';
          }
          const text = node.data;
          if (text.length > 20000) return;
          for (const tok of tokenize(text, lang)) {
            const r = new Range();
            r.setStart(node, tok.start);
            r.setEnd(node, tok.end);
            sets[tok.type].add(r);
          }
        });
      };
      const schedule = () => { if (!timer) timer = requestAnimationFrame(paint); };
      ctx.onMutate(schedule);
      ctx.on('store:change', (s, p) => { if (s.messages !== p.messages) schedule(); });
      schedule();
      ctx.cleanup(() => {
        if (timer) cancelAnimationFrame(timer);
        TYPES.forEach((t) => CSS.highlights.delete('ym-c-' + t));
      });
      ctx.css(`
::highlight(ym-c-comment){color:#6a9955}
::highlight(ym-c-string){color:#ce9178}
::highlight(ym-c-number){color:#b5cea8}
::highlight(ym-c-keyword){color:#569cd6}
::highlight(ym-c-function){color:#dcdcaa}
::highlight(ym-c-type){color:#4ec9b0}
::highlight(ym-c-tag){color:#569cd6}
::highlight(ym-c-attr){color:#9cdcfe}
::highlight(ym-c-prop){color:#9cdcfe}
:root[data-theme="light"] ::highlight(ym-c-comment){color:#008000}
:root[data-theme="light"] ::highlight(ym-c-string){color:#a31515}
:root[data-theme="light"] ::highlight(ym-c-number){color:#098658}
:root[data-theme="light"] ::highlight(ym-c-keyword){color:#0000ff}
:root[data-theme="light"] ::highlight(ym-c-function){color:#795e26}
:root[data-theme="light"] ::highlight(ym-c-type){color:#267f99}
:root[data-theme="light"] ::highlight(ym-c-tag){color:#800000}
:root[data-theme="light"] ::highlight(ym-c-attr){color:#e50000}
:root[data-theme="light"] ::highlight(ym-c-prop){color:#0451a5}
`);
    },
  });
})();
