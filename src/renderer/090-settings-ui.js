// Settings UI: a "YapCord" section inside Yapper's own settings modal.
// Yapper's modal is React-owned: we only append our nav buttons and one panel element, and hide React's content with
// CSS while one of our pages is active.

const h = YM.dom.h;
/** Replace an element's content. Unlike Element.replaceChildren this flattens arrays and skips null / false (those would become text). */
const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
const PAGES = [
  { id: 'plugins', label: 'Plugins' },
  { id: 'themes', label: 'Themes' },
  { id: 'wallpaper', label: 'Wallpaper' },
  { id: 'quickcss', label: 'Custom CSS' },
  { id: 'layout', label: 'Layout' },
  { id: 'app', label: 'App', appOnly: true },
];

const Ui = (YM.settingsUi = { page: null, restartNeeded: false });
let unsub = [];

function clearSubs() {
  unsub.forEach((fn) => {
    try { fn(); } catch (_) { /* ignore */ }
  });
  unsub = [];
}

// ---- small controls ----------------------------------------------------------------------------
const btn = (label, onClick, extra = '') => h('button', { class: 'ym-btn ' + extra, type: 'button', onClick }, label);

function toggleRow(title, hint, checked, onChange) {
  return h('label', { class: 'toggle-row' },
    h('div', {}, h('div', { class: 'toggle-label' }, title), hint ? h('div', { class: 'hint' }, hint) : null),
    h('input', { type: 'checkbox', class: 'switch', checked: !!checked, onChange: (e) => onChange(e.target.checked) }));
}

function section(title, ...children) {
  return h('div', { class: 'ym-section' }, h('h3', {}, title), ...children);
}

function humanize(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

// ---- plugin option controls ----------------------------------------------------------------------
function optionControl(plugin, key, def) {
  const st = plugin.settings;
  const title = def.description || humanize(key);
  const value = st.store[key];
  switch (def.type) {
    case 'boolean':
      return toggleRow(title, def.hint, value, (v) => st.set(key, v));
    case 'select':
      return h('div', { class: 'ym-opt' }, h('div', { class: 'toggle-label' }, title),
        h('select', { class: 'ym-input', onChange: (e) => {
          const opt = def.options[e.target.selectedIndex];
          st.set(key, opt.value);
        } }, def.options.map((o) => h('option', { value: String(o.value), selected: o.value === value }, o.label))));
    case 'number':
    case 'slider':
      return h('div', { class: 'ym-opt' }, h('div', { class: 'toggle-label' }, title),
        h('input', { class: 'ym-input', type: def.type === 'slider' ? 'range' : 'number', min: def.min, max: def.max, step: def.step, value: String(value ?? ''),
          onChange: (e) => {
            const raw = String(e.target.value).trim();
            if (raw === '') { // an emptied field means "back to the default", not 0
              st.set(key, def.default);
              e.target.value = String(def.default ?? '');
              return;
            }
            let n = Number(raw);
            if (!Number.isFinite(n)) return;
            if (typeof def.min === 'number') n = Math.max(def.min, n);
            if (typeof def.max === 'number') n = Math.min(def.max, n);
            st.set(key, n);
            if (String(n) !== raw) e.target.value = String(n);
          } }));
    case 'string':
      return h('div', { class: 'ym-opt' }, h('div', { class: 'toggle-label' }, title),
        h('input', { class: 'ym-input', type: 'text', value: String(value ?? ''), spellcheck: 'false',
          onChange: (e) => st.set(key, e.target.value) }));
    case 'custom': {
      const box = h('div', { class: 'ym-opt ym-custom' });
      try { def.render(box, plugin); } catch (err) { box.textContent = 'Could not render this option: ' + err.message; }
      return box;
    }
    default:
      return null;
  }
}

/** A steady colour per category, so cards of one kind look related. */
function tagHue(text) {
  let n = 0;
  for (const c of String(text)) n = (n * 31 + c.charCodeAt(0)) % 360;
  return n;
}

function pluginCard(plugin, expanded, onToggleExpand) {
  const running = YM.plugins.isRunning(plugin.name);
  const err = YM.plugins.errors.get(plugin.name);
  const optionKeys = Object.keys(plugin.options);
  return h('div', { class: 'ym-plug' + (running ? ' on' : '') },
    h('div', { class: 'ym-plug-body' },
      h('div', { class: 'ym-plug-name' }, plugin.name),
      plugin.description ? h('div', { class: 'ym-plug-desc' }, plugin.description) : null,
      plugin.tags.length ? h('div', { class: 'ym-plug-tags' }, plugin.tags.join(' \u00b7 ')) : null,
      err ? h('div', { class: 'ym-error' }, 'Failed to start: ' + (err && err.message ? err.message : String(err))) : null),
    h('label', { class: 'ym-plug-switch', title: (running ? 'Disable ' : 'Enable ') + plugin.name },
      h('input', { type: 'checkbox', class: 'switch', 'aria-label': 'Enable ' + plugin.name, checked: YM.plugins.isEnabled(plugin.name),
        onChange: (e) => { YM.plugins.setEnabled(plugin.name, e.target.checked); Ui.markRestartNeeded(); } })),
    optionKeys.length ? h('div', { class: 'ym-plug-foot' },
      btn(expanded ? 'Hide options' : 'Options', onToggleExpand, 'ym-btn-small ym-btn-ghost')) : null,
    expanded ? h('div', { class: 'ym-options' }, optionKeys.map((k) => optionControl(plugin, k, plugin.options[k])),
      btn('Reset to defaults', () => { plugin.settings.resetAll(); onToggleExpand(); onToggleExpand(); }, 'ym-btn-small ym-btn-ghost')) : null);
}

// ---- "Reload suggested" notice (shown after a plugin was switched on or off; optional, plugins already work live) --------------------
Ui.markRestartNeeded = () => {
  Ui.restartNeeded = true;
  YM.Events.emit('ui:restart-needed');
};

function restartBanner() {
  const el = h('div', { class: 'ym-restart', role: 'alert' },
    h('b', {}, 'Reload suggested'),
    h('span', {}, 'Plugins already switch on and off right away. Reload the page only if something looks off (you stay logged in).'),
    h('button', { class: 'ym-restart-btn', type: 'button', onClick: () => YM.native.app.reload() }, 'Reload'));
  const sync = () => { el.hidden = !Ui.restartNeeded; };
  sync();
  unsub.push(YM.Events.on('ui:restart-needed', sync));
  return el;
}

// ---- pages -------------------------------------------------------------------------------------
function pagePlugins(root) {
  const expanded = new Set();
  let query = '';
  let filter = 'all';
  let tag = '';
  const list = h('div', { class: 'ym-list ym-grid' });
  const summary = h('span', { class: 'ym-summary' });
  const chips = h('div', { class: 'ym-chips', role: 'group', 'aria-label': 'Categories' });
  const seg = h('div', { class: 'ym-seg', role: 'group', 'aria-label': 'Show' });
  const segBtns = [['all', 'All'], ['on', 'On'], ['off', 'Off']].map(([v, label]) => h('button', { type: 'button', class: 'ym-seg-btn', 'data-v': v, onClick: () => { filter = v; draw(); } }, label));
  seg.append(...segBtns);
  const drawChips = () => {
    const counts = new Map();
    for (const p of YM.plugins.list()) for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + 1);
    chips.replaceChildren(...[...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, n]) =>
      h('button', { type: 'button', class: 'ym-chip-btn' + (tag === t ? ' on' : ''), style: { '--hue': String(tagHue(t)) }, 'aria-pressed': tag === t ? 'true' : 'false', onClick: () => { tag = tag === t ? '' : t; draw(); } }, t, h('em', {}, String(n)))));
  };
  const draw = () => {
    list.replaceChildren();
    const all = YM.plugins.list();
    const q = query.trim().toLowerCase();
    const items = all.filter((p) => {
      if (filter === 'on' && !YM.plugins.isEnabled(p.name)) return false;
      if (filter === 'off' && YM.plugins.isEnabled(p.name)) return false;
      if (tag && !p.tags.includes(tag)) return false;
      return !q || (p.name + ' ' + p.description + ' ' + p.tags.join(' ')).toLowerCase().includes(q);
    }).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    const on = all.filter((p) => YM.plugins.isEnabled(p.name)).length;
    summary.textContent = on + ' of ' + all.length + ' switched on';
    segBtns.forEach((b) => b.classList.toggle('on', b.getAttribute('data-v') === filter));
    drawChips();
    if (!items.length) list.append(h('div', { class: 'ym-empty' }, 'Nothing matches. Clear the search or pick another category.'));
    for (const p of items) {
      list.append(pluginCard(p, expanded.has(p.name), () => { expanded.has(p.name) ? expanded.delete(p.name) : expanded.add(p.name); draw(); }));
    }
  };
  root.append(
    h('div', { class: 'ym-hero' },
      h('h1', {}, 'YapCord'),
      h('p', {}, 'Tweaks and plugins for yapper'),
      h('div', { class: 'ym-hero-div' })),
    h('div', { class: 'ym-page-head' }, h('h3', { class: 'ym-sec' }, 'Plugins'), summary),
    restartBanner(),
    h('div', { class: 'ym-toolbar' },
      h('input', { class: 'ym-input', type: 'search', placeholder: 'Search plugins', 'aria-label': 'Search plugins', onInput: (e) => { query = e.target.value; draw(); } }),
      seg),
    chips,
    list,
    h('h3', { class: 'ym-sec' }, 'About'),
    h('div', { class: 'ym-about' },
      h('p', {}, 'thanks for using yapcord \u2764\ufe0f'),
      h('p', {}, 'version 1.0'),
      h('p', {}, YM.plugins.list().length + ' plugins')));
  draw();
  unsub.push(YM.Events.on('plugin:state', () => { if (list.isConnected && !list.querySelector(':focus')) draw(); }));
  unsub.push(YM.Events.on('plugin:error', () => { if (list.isConnected) draw(); }));
}

function translateExternalTheme(source, fallbackName = 'Imported Theme') {
  let css = String(source || '').replace(/^\uFEFF/, '');
  // Do not execute or preserve remote imports, font-face blocks, JS URLs, or CSS expression tricks.
  css = css.replace(/@import[^;]+;?/gi, '');
  css = css.replace(/@font-face\s*\{[\s\S]*?\}/gi, '');
  css = css.replace(/expression\s*\([^)]*\)/gi, '');
  css = css.replace(/url\(\s*(['"]?)\s*(?:javascript:|data:text\/html)[^)]*\)/gi, 'none');
  // Common Discord/Vencord variables -> YapCord variables.
  const vars = {
    '--background-primary': '--bg-main', '--background-secondary': '--bg-side', '--background-secondary-alt': '--bg-side',
    '--background-tertiary': '--bg-rail', '--background-floating': '--bg-float', '--background-mobile-primary': '--bg-main',
    '--channeltextarea-background': '--bg-input', '--brand-experiment': '--accent', '--brand-experiment-560': '--accent',
    '--text-normal': '--text', '--header-primary': '--text', '--text-link': '--accent',
  };
  for (const [from, to] of Object.entries(vars)) css = css.replaceAll(from, to);
  css = css.replace(/\.theme-dark\b|\.theme-light\b/g, ':root').replace(/#app-mount\b|\.appMount\b/g, 'body');
  const headerName = css.match(/@(?:name|title)\s+([^\r\n*]+)/i)?.[1]?.trim();
  const name = (headerName || fallbackName || 'Imported Theme').replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'Imported Theme';
  const image = css.match(/--(?:dplus-backdrop|background-image|bg-image)\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i)?.[1] || '';
  const fileName = name.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'Imported-Theme';
  return { name, fileName: fileName + '.theme.css', css: `/* @name ${name} @author YapCord Translator @description Safely translated Discord/Vencord theme */\n${css}`, wallpaper: image };
}

async function saveTranslatedTheme(source, fallbackName) {
  const translated = translateExternalTheme(source, fallbackName);
  const saved = await YM.native.themes.save(translated.fileName, translated.css);
  if (!saved) throw new Error('Could not save the translated theme.');
  if (translated.wallpaper && !YM.settings.get('wallpaper.image', '')) {
    YM.settings.set('wallpaper', {
      ...YM.settings.get('wallpaper', {}),
      image: translated.wallpaper,
      position: 'center center',
      size: 'cover',
    });
  }
  await YM.themes.refresh();
  YM.themes.setEnabled(saved, true);
  return saved;
}

function pageThemes(root) {
  const list = h('div', { class: 'ym-list' });
  const links = h('div', { class: 'ym-list' });
  const draw = () => {
    list.replaceChildren();
    const themes = YM.themes.available;
    if (!themes.length) list.append(h('div', { class: 'ym-empty' }, 'No themes yet. Add a .css or .theme.css file.'));
    for (const t of themes) {
      list.append(h('div', { class: 'ym-card' },
        h('div', { class: 'ym-card-head' },
          h('div', { class: 'ym-card-title' }, h('b', {}, t.name), t.version ? h('span', { class: 'ym-tags' }, 'v' + t.version) : null),
          h('input', { type: 'checkbox', class: 'switch', 'aria-label': 'Enable ' + t.name, checked: YM.themes.isEnabled(t.fileName),
            onChange: (e) => YM.themes.setEnabled(t.fileName, e.target.checked) })),
        t.description ? h('div', { class: 'ym-card-desc' }, t.description) : null,
        h('div', { class: 'ym-card-foot' }, h('span', { class: 'ym-hint' }, 'by ' + (t.author || 'Unknown') + ' · ' + t.fileName),
          btn('Remove', async () => { if (confirm('Delete ' + t.fileName + '?')) { await YM.themes.remove(t.fileName); } }, 'ym-btn-small ym-btn-danger'))));
    }
    links.replaceChildren();
    for (const url of YM.settings.get('themeLinks', []) || []) {
      links.append(h('div', { class: 'ym-card ym-card-row' }, h('code', {}, url), btn('Remove', () => { YM.themes.removeLink(url); draw(); }, 'ym-btn-small ym-btn-danger')));
    }
  };
  const input = h('input', { class: 'ym-input', type: 'url', placeholder: 'https://example.com/theme.css' });
  const rawInput = h('input', { class: 'ym-input', type: 'url', placeholder: 'https://example.com/theme.css' });
  const fileInput = h('input', { type: 'file', accept: '.css,text/css', hidden: true, onChange: (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => { try { await saveTranslatedTheme(reader.result, f.name.replace(/\.css$/i, '')); draw(); YM.toast('Translated theme imported.', { type: 'success' }); } catch (err) { YM.toast('Could not import theme: ' + err.message, { type: 'error' }); } };
    reader.readAsText(f);
  } });
  const importUrl = async () => {
    const url = input.value.trim();
    if (!/^https?:\/\//i.test(url)) return YM.toast('Enter a direct http(s) CSS URL.', { type: 'error' });
    try { await saveTranslatedTheme(await YM.native.themes.fetch(url), url.split('/').pop()?.replace(/\.css(?:\?.*)?$/i, '') || 'Imported Theme'); input.value = ''; draw(); YM.toast('Translated theme imported.', { type: 'success' }); }
    catch (err) { YM.toast('Could not download theme: ' + err.message, { type: 'error' }); }
  };
  root.append(
    h('h2', {}, 'Themes'),
    h('p', { class: 'hint' }, 'YapCord themes use CSS. You can import normal YapCord/Vencord-style CSS directly, or safely translate many Discord/BetterDiscord themes into YapCord colors and compatible rules.'),
    h('div', { class: 'ym-toolbar' },
      btn('Add theme file', async () => { try { await YM.themes.importFile(); draw(); } catch (e) { YM.toast('Could not add theme: ' + e.message, { type: 'error' }); } }),
      btn('Translate local Discord theme', () => fileInput.click(), 'ym-btn-ghost'),
      btn('Open themes folder', () => YM.native.openPath('themes'), 'ym-btn-ghost'),
      btn('Reload list', async () => { await YM.themes.refresh(); draw(); }, 'ym-btn-ghost'), fileInput),
    list,
    section('Translate online Discord/Vencord theme', h('p', { class: 'hint' }, 'Paste the direct .css download URL, not the BetterDiscord theme webpage URL. Imports are stripped of @import and unsafe CSS tricks.'), h('div', { class: 'ym-toolbar' }, input, btn('Translate and import', importUrl))),
    section('Online themes', h('div', { class: 'ym-toolbar' }, rawInput, btn('Add raw CSS link', () => { if (YM.themes.addLink(rawInput.value)) { rawInput.value = ''; draw(); } else YM.toast('Enter a valid http(s) link.', { type: 'error' }); })), links));
  draw();
  unsub.push(YM.Events.on('themes:list', () => { if (list.isConnected) draw(); }));
}

function validWallpaperImage(value) {
  const v = String(value || '').trim();
  return /^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(v) ? v : '';
}

function applyWallpaper() {
  const w = YM.settings.get('wallpaper', {}) || {};
  const image = validWallpaperImage(w.image);
  if (!w.enabled || !image) {
    YM.dom.css.remove('wallpaper');
    return;
  }
  const opacity = Math.max(0, Math.min(1, Number(w.opacity) || 0));
  const overlay = Math.max(0, Math.min(1, Number(w.overlay) || 0));
  const blur = Math.max(0, Math.min(24, Number(w.blur) || 0));
  const position = ['left center', 'center center', 'right center'].includes(w.position) ? w.position : 'right center';
  const size = ['cover', 'contain', 'min(58vw, 850px) auto'].includes(w.size) ? w.size : 'min(58vw, 850px) auto';
  const imageCss = JSON.stringify(image);
  YM.dom.css.set('wallpaper', `
    html,body{background:#08090d!important;}
    body{background-image:linear-gradient(90deg,rgba(8,9,13,${overlay}) 0%,rgba(8,9,13,${(overlay * .72).toFixed(3)}) 44%,rgba(8,9,13,${(overlay * .12).toFixed(3)}) 100%),url(${imageCss})!important;background-position:0 0,${position}!important;background-size:100% 100%,${size}!important;background-repeat:no-repeat!important;background-attachment:fixed!important;}
    body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:inherit;filter:blur(${blur}px);transform:scale(${blur ? 1.02 : 1});}
    body>div:first-child,#root,#app,[data-reactroot],main,[role="main"],.app,.layout,.main,.content,.chat,.messages{background-color:transparent!important;}
    body>div:first-child{min-height:100vh!important;}
  `);
}

applyWallpaper();
YM.settings.onChange((path) => { if (path === 'wallpaper' || String(path).startsWith('wallpaper.')) applyWallpaper(); });

function pageWallpaper(root) {
  const w = () => YM.settings.get('wallpaper', {}) || {};
  const set = (key, value) => { YM.settings.set('wallpaper.' + key, value); applyWallpaper(); };
  const value = (key, fallback) => w()[key] ?? fallback;
  const status = h('span', { class: 'ym-hint' }, 'Changes apply immediately.');
  const image = h('input', { class: 'ym-input', type: 'url', placeholder: 'https://example.com/wallpaper.png', value: /^data:image\//i.test(value('image', '')) ? '' : value('image', ''), spellcheck: 'false' });
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onChange: (e) => {
    const selected = e.target.files && e.target.files[0];
    if (!selected) return;
    const reader = new FileReader();
    reader.onload = () => { set('image', String(reader.result || '')); draw(); };
    reader.readAsDataURL(selected);
  } });
  const draw = () => {
    const current = w();
    fill(root,
      h('h2', {}, 'Wallpaper'),
      h('p', { class: 'hint' }, 'Place an image behind Yapper’s interface. A dark overlay keeps channels and messages readable, similar to the wallpaper style in your example.'),
      toggleRow('Enable wallpaper', 'Turn the background image on or off without deleting it.', current.enabled !== false, (v) => set('enabled', v)),
      section('Image',
        h('div', { class: 'ym-toolbar' }, image, btn('Use image URL', () => { set('image', image.value.trim()); draw(); }), btn('Choose local image', () => file.click(), 'ym-btn-ghost'), file),
        current.image && /^data:image\//i.test(current.image) ? h('div', { class: 'ym-hint' }, 'A local image is selected and stored in YapCord settings.') : null,
        btn('Clear wallpaper image', () => { set('image', ''); image.value = ''; draw(); }, 'ym-btn-small ym-btn-danger')),
      section('Appearance',
        h('div', { class: 'ym-opt' }, h('div', { class: 'ym-lay-head' }, h('div', { class: 'toggle-label' }, 'Wallpaper opacity'), h('span', { class: 'ym-lay-val' }, Math.round((current.opacity ?? .95) * 100) + '%')), h('input', { class: 'ym-range', type: 'range', min: 0, max: 1, step: .01, value: String(current.opacity ?? .95), onInput: (e) => { set('opacity', Number(e.target.value)); draw(); } })),
        h('div', { class: 'ym-opt' }, h('div', { class: 'ym-lay-head' }, h('div', { class: 'toggle-label' }, 'Dark overlay'), h('span', { class: 'ym-lay-val' }, Math.round((current.overlay ?? .65) * 100) + '%')), h('input', { class: 'ym-range', type: 'range', min: 0, max: 1, step: .01, value: String(current.overlay ?? .65), onInput: (e) => { set('overlay', Number(e.target.value)); draw(); } })),
        h('div', { class: 'ym-opt' }, h('div', { class: 'ym-lay-head' }, h('div', { class: 'toggle-label' }, 'Blur'), h('span', { class: 'ym-lay-val' }, (current.blur ?? 0) + ' px')), h('input', { class: 'ym-range', type: 'range', min: 0, max: 24, step: 1, value: String(current.blur ?? 0), onInput: (e) => { set('blur', Number(e.target.value)); draw(); } })),
        h('div', { class: 'ym-opt' }, h('div', { class: 'toggle-label' }, 'Image position'), h('select', { class: 'ym-input', value: current.position || 'right center', onChange: (e) => { set('position', e.target.value); draw(); } }, ['left center', 'center center', 'right center'].map((x) => h('option', { value: x, selected: x === (current.position || 'right center') }, x)))),
        h('div', { class: 'ym-opt' }, h('div', { class: 'toggle-label' }, 'Image size'), h('select', { class: 'ym-input', value: current.size || 'min(58vw, 850px) auto', onChange: (e) => { set('size', e.target.value); draw(); } }, [['min(58vw, 850px) auto', 'Character / side image'], ['cover', 'Cover the whole window'], ['contain', 'Fit the whole image']].map(([v, label]) => h('option', { value: v, selected: v === (current.size || 'min(58vw, 850px) auto') }, label))))),
      h('div', { class: 'ym-toolbar' }, status, btn('Reset wallpaper settings', () => { YM.settings.set('wallpaper', { enabled: true, image: '', position: 'right center', size: 'min(58vw, 850px) auto', opacity: .95, overlay: .65, blur: 0 }); applyWallpaper(); draw(); }, 'ym-btn-ghost')));
  };
  draw();
}

async function pageQuickCss(root) {
  const ta = h('textarea', { class: 'ym-input ym-code', spellcheck: 'false', rows: 18, placeholder: '/* Your CSS runs on top of every theme. */' });
  const status = h('span', { class: 'ym-hint' }, '');
  ta.value = await YM.themes.getQuickCss();
  const save = YM.util.debounce(async () => { await YM.themes.setQuickCss(ta.value); status.textContent = 'Saved'; }, 400);
  ta.addEventListener('input', () => { status.textContent = 'Saving...'; save(); });
  root.append(
    h('h2', {}, 'Custom CSS'),
    toggleRow('Enable Custom CSS', 'Applied last, so it wins over themes.', YM.settings.get('useQuickCss', true), (v) => YM.settings.set('useQuickCss', v)),
    h('div', { class: 'ym-toolbar' }, status, btn('Open file', () => YM.native.openPath('data'), 'ym-btn-ghost ym-btn-small')),
    ta);
  unsub.push(YM.native.quickCss.onChange((css) => { if (document.activeElement !== ta && css !== ta.value) ta.value = css; }));
}

async function pageApp(root) {
  const w = (k, d) => YM.settings.get('window.' + k, d);
  const set = (k) => (v) => YM.settings.set('window.' + k, v);
  if (YM.official) {
    // Inside the official Yapper app: the window, tray, autostart, updates and screen picker are Yapper's own.
    root.append(
      h('h2', {}, 'App'),
      h('p', {}, 'YapCord is running inside the official Yapper app, so there is just one app and you stay logged in.'),
      h('p', { class: 'hint' }, 'Window, tray icon, "Start with Windows", updates and the screen picker are handled by Yapper itself. Your YapCord settings and themes are stored in the YapCord folder and shared with the stand-alone YapCord app.'),
      h('p', { class: 'hint' }, 'After a Yapper update YapCord can be gone from the app. Run Install-in-Yapper.bat again to put it back.'),
      h('div', { class: 'ym-toolbar', style: { marginTop: '14px' } },
        btn('Reload', () => YM.native.app.reload()), btn('DevTools', () => YM.native.app.devtools(), 'ym-btn-ghost'),
        btn('Open data folder', () => YM.native.openPath('data'), 'ym-btn-ghost')));
    return;
  }
  root.append(
    h('h2', {}, 'App'),
    toggleRow('Close to tray', 'The close button hides the window; quit from the tray icon.', w('closeToTray', false), set('closeToTray')),
    toggleRow('Start with Windows', 'Launches YapCord when you sign in.', w('autoStart', false), set('autoStart')),
    toggleRow('Start minimized', 'Only applies together with "Start with Windows".', w('startMinimized', false), set('startMinimized')),
    toggleRow('Spell checking', 'Underline misspelled words in the message box.', w('spellcheck', true), set('spellcheck')),
    toggleRow('Hardware acceleration', 'Turn off if you see graphical glitches. Needs a restart.', w('hardwareAcceleration', true), set('hardwareAcceleration')),
    toggleRow('Allow developer tools', 'Ctrl+Shift+I opens DevTools.', w('devTools', true), set('devTools')),
    toggleRow("Use YapCord's file dialog", 'Makes the + button next to the message box (and other upload buttons) open Windows\' own file dialog. Turn off to use the browser\'s file chooser.', w('ownFilePicker', true), set('ownFilePicker')),
    toggleRow('Close the Yapper app', 'While YapCord is open the official Yapper desktop app is closed, and closed again if you start it. Yapper in a browser tab is not touched.', w('closeYapperApp', true), set('closeYapperApp')),
    h('div', { class: 'ym-opt' },
      h('div', { class: 'toggle-label' }, 'Program name of the Yapper app'),
      h('div', { class: 'hint' }, 'Comma separated. Only file names that end in .exe and contain "yapper" are accepted. Default: Yapper.exe'),
      h('input', { class: 'ym-input', type: 'text', value: (w('yapperAppNames', ['Yapper.exe']) || []).join(', '), spellcheck: 'false',
        onChange: (e) => { const names = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); set('yapperAppNames')(names.length ? names : ['Yapper.exe']); } })),
    h('div', { class: 'ym-toolbar', style: { marginTop: '14px' } },
      btn('Reload', () => YM.native.app.reload()), btn('Restart app', () => YM.native.app.relaunch(), 'ym-btn-ghost'), btn('DevTools', () => YM.native.app.devtools(), 'ym-btn-ghost'),
      btn('Quit', () => YM.native.app.quit(), 'ym-btn-danger')));

  const updateStatus = h('div', { class: 'ym-updater-status' }, 'Checking for updates…');
  const updateNote = h('p', { class: 'ym-hint' }, 'Updates are downloaded from the YapCord GitHub releases page and verified before installation. Nothing installs automatically.');
  const updateActions = h('div', { class: 'ym-toolbar' });
  const updatePanel = h('div', { class: 'ym-card ym-updater' }, h('h3', {}, 'Updates'), updateStatus, updateNote, updateActions);
  root.append(updatePanel);
  function renderUpdate(state) {
    const s = state || { state: 'unknown' };
    const version = s.available && s.available.version ? ` · v${s.available.version}` : '';
    const labels = {
      checking: 'Checking for updates…', 'up-to-date': 'You are up to date.', available: `Update available${version}.`,
      downloading: 'Downloading and verifying update…', ready: `Update v${s.available?.version || ''} is ready to install.`,
      installing: 'Restarting to install update…', unsupported: 'Updates are only available in the packaged Windows client.',
      error: 'Update check failed: ' + (s.error || 'unknown error'), idle: 'Not checked yet.', unknown: 'Update status unavailable.',
    };
    updateStatus.textContent = labels[s.state] || ('Update status: ' + s.state);
    updateActions.replaceChildren();
    if (s.state === 'available') updateActions.append(btn('Download update', async () => {
      try { renderUpdate(await YM.native.app.downloadUpdate()); } catch (err) { renderUpdate({ state: 'error', error: err.message }); }
    }));
    if (s.state === 'ready') updateActions.append(btn('Install and restart', async () => {
      try { await YM.native.app.installUpdate(); renderUpdate({ state: 'installing' }); } catch (err) { renderUpdate({ state: 'error', error: err.message }); }
    }));
    if (s.state !== 'downloading' && s.state !== 'installing') updateActions.append(btn('Check now', async () => {
      try { renderUpdate(await YM.native.app.checkForUpdates()); } catch (err) { renderUpdate({ state: 'error', error: err.message }); }
    }, 'ym-btn-ghost'));
  }
  YM.native.app.updateStatus().then(renderUpdate).catch((err) => renderUpdate({ state: 'error', error: err.message }));
  unsub.push(YM.native.app.onUpdateState(renderUpdate));

  const setup = btn('Open first-run setup', () => YM.onboarding && YM.onboarding.open(0), 'ym-btn-ghost');
  root.append(h('div', { class: 'ym-toolbar' }, setup));

  const perf = h('div', { class: 'ym-list' });
  const perfNote = h('p', { class: 'ym-hint' }, 'Process memory is the current working set. CPU is sampled between refreshes. Metrics stay on this device.');
  const refresh = btn('Refresh now', () => updateMetrics(), 'ym-btn-small ym-btn-ghost');
  const metricStatus = h('div', { class: 'ym-hint' }, 'Collecting local process metrics…');
  root.append(h('h3', {}, 'Performance'), perfNote, h('div', { class: 'ym-toolbar' }, refresh), metricStatus, perf);

  async function updateMetrics() {
    try {
      const result = await YM.native.app.metrics();
      const rows = (result && result.processes) || [];
      perf.replaceChildren();
      if (!rows.length) {
        metricStatus.textContent = 'No process metrics are available in this environment.';
        return;
      }
      const totalMemory = rows.reduce((sum, row) => sum + (Number(row.workingSetKB) || 0), 0) / 1024;
      const totalCpu = rows.reduce((sum, row) => sum + (Number(row.cpuPercent) || 0), 0);
      metricStatus.textContent = `${rows.length} app processes · ${totalMemory.toFixed(0)} MB working set · ${totalCpu.toFixed(1)}% summed CPU`;
      for (const row of rows) {
        const name = String(row.type || 'process').replace(/[-_]/g, ' ');
        const memory = ((Number(row.workingSetKB) || 0) / 1024).toFixed(0);
        const cpu = (Number(row.cpuPercent) || 0).toFixed(1);
        perf.append(h('div', { class: 'ym-card' }, h('div', { class: 'ym-card-row' },
          h('b', {}, name), h('span', { class: 'ym-hint' }, `${memory} MB · ${cpu}% CPU`))));
      }
    } catch (err) {
      metricStatus.textContent = 'Could not read process metrics: ' + ((err && err.message) || err);
    }
  }
  updateMetrics();
  const metricsTimer = setInterval(updateMetrics, 2500);
  unsub.push(() => clearInterval(metricsTimer));

  const activeAddons = YM.plugins.list().filter((p) => YM.plugins.isEnabled(p.name));
  root.append(h('h3', {}, `Enabled YapCord add-ons (${activeAddons.length})`));
  if (activeAddons.length) {
    root.append(h('div', { class: 'ym-list' }, activeAddons.map((p) => h('div', { class: 'ym-card' },
      h('div', { class: 'ym-card-row' }, h('b', {}, p.name), h('span', { class: 'ym-hint' }, YM.plugins.isRunning(p.name) ? 'Running' : 'Not running')),
      p.description ? h('div', { class: 'ym-card-desc' }, p.description) : null))));
  } else {
    root.append(h('p', { class: 'ym-hint' }, 'No add-ons are enabled.'));
  }
}

// ---- Layout page: where the main columns sit, and sizes --------------------------------------------
function pageLayout(root) {
  const L = YM.layout;
  const body = h('div', { class: 'ym-layout' });
  const PRESETS = [
    { label: 'Original', order: ['rail', 'sidebar', 'main'] },
    { label: 'Servers on the right', order: ['sidebar', 'main', 'rail'] },
    { label: 'Mirrored', order: ['main', 'sidebar', 'rail'] },
    { label: 'Channels on the right', order: ['rail', 'main', 'sidebar'] },
  ];
  const SLIDERS = [
    { key: 'railIcon', title: 'Server icon size', suffix: ' px' },
    { key: 'sidebarWidth', title: 'Channel / DM list width', suffix: ' px' },
    { key: 'chatText', title: 'Chat text size', suffix: ' %' },
    { key: 'messageGap', title: 'Space between messages', suffix: ' %' },
    { key: 'zoom', title: 'Whole app size (zoom)', suffix: ' %', appOnly: true },
  ];
  const draw = () => {
    const c = L.get();
    const tiles = c.order.map((part, i) => h('div', { class: 'ym-lay-tile ym-lay-' + part },
      h('b', {}, L.PART_NAMES[part]),
      h('div', { class: 'ym-lay-arrows' },
        h('button', { class: 'ym-btn ym-btn-small ym-btn-ghost', type: 'button', title: 'Move left', 'aria-label': 'Move ' + L.PART_NAMES[part] + ' left', disabled: i === 0, onClick: () => { L.move(part, -1); draw(); } }, '◀'),
        h('button', { class: 'ym-btn ym-btn-small ym-btn-ghost', type: 'button', title: 'Move right', 'aria-label': 'Move ' + L.PART_NAMES[part] + ' right', disabled: i === c.order.length - 1, onClick: () => { L.move(part, 1); draw(); } }, '▶'))));
    fill(body,
      h('p', { class: 'hint' }, 'Put the parts of Yapper where you want them and change their size. Changes show right away. Nothing of Yapper itself is changed, so Reset brings back the original layout. On a narrow window Yapper keeps its own one-column layout.'),
      h('h3', {}, 'Order (left to right)'),
      h('div', { class: 'ym-lay-row' }, tiles),
      h('div', { class: 'ym-toolbar' }, PRESETS.map((p) => btn(p.label, () => { L.set('order', p.order); draw(); }, 'ym-btn-small ym-btn-ghost'))),
      h('h3', {}, 'Sizes'),
      SLIDERS.filter((d) => !d.appOnly || (YM.native && YM.native.ui)).map((d) => {
        const [min, max] = L.LIMITS[d.key];
        const out = h('span', { class: 'ym-lay-val' }, c[d.key] + d.suffix);
        const input = h('input', { class: 'ym-range', type: 'range', min, max, step: 1, value: String(c[d.key]), 'aria-label': d.title,
          onInput: (e) => { out.textContent = e.target.value + d.suffix; L.set(d.key, Number(e.target.value)); } });
        return h('div', { class: 'ym-opt' }, h('div', { class: 'ym-lay-head' }, h('div', { class: 'toggle-label' }, d.title), out), input);
      }),
      h('div', { class: 'ym-toolbar' }, btn('Reset layout', () => { L.reset(); draw(); }, 'ym-btn-danger')));
  };
  draw();
  root.append(h('h2', {}, 'Layout'), body);
  unsub.push(YM.Events.on('layout:change', () => { if (!body.contains(document.activeElement)) draw(); }));
}

const RENDER = { plugins: pagePlugins, themes: pageThemes, wallpaper: pageWallpaper, quickcss: pageQuickCss, layout: pageLayout, app: pageApp };

// ---- injection into Yapper's settings modal ------------------------------------------------------
function currentSettingsEl() {
  return document.querySelector('.settings');
}

function deactivate() {
  const s = currentSettingsEl();
  clearSubs();
  Ui.page = null;
  if (!s) return;
  s.classList.remove('ym-active');
  s.querySelectorAll('.ym-panel').forEach((p) => p.remove());
  s.querySelectorAll('.ym-nav-btn.active').forEach((b) => b.classList.remove('active'));
}

async function activate(page) {
  const s = currentSettingsEl();
  const main = s && s.querySelector('.settings-main');
  if (!s || !main || !RENDER[page]) return;
  clearSubs();
  s.querySelectorAll('.ym-panel').forEach((p) => p.remove());
  s.classList.add('ym-active');
  s.querySelectorAll('.ym-nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.ymPage === page));
  const panel = h('div', { class: 'ym-panel' });
  main.append(panel);
  Ui.page = page;
  try {
    await RENDER[page](panel);
  } catch (err) {
    YM.log.error('settings page failed', page, err);
    panel.append(h('div', { class: 'ym-error' }, 'This page failed to load: ' + err.message));
  }
}

function injectNav(nav) {
  if (nav.querySelector('.ym-nav-label')) return;
  nav.append(h('div', { class: 'settings-nav-label ym-nav-label', style: { marginTop: '14px' } }, '\ud83e\udd8a YapCord'));
  for (const p of PAGES) {
    if (p.appOnly && !YM.inApp) continue;
    nav.append(h('button', { class: 'ym-nav-btn', type: 'button', dataset: { ymPage: p.id }, onClick: () => activate(p.id) }, p.label));
  }
  // Picking one of Yapper's own tabs hands the panel back to React.
  nav.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('button') : null;
    if (b && !b.classList.contains('ym-nav-btn')) deactivate();
  }, true);
  if (Ui.pending) {
    const page = Ui.pending;
    Ui.pending = null;
    activate(page);
  }
}

YM.dom.watch('.settings-nav', injectNav);

Ui.open = async function open(page) {
  Ui.pending = RENDER[page] ? page : 'plugins';
  if (document.querySelector('.settings-nav')) {
    const p = Ui.pending;
    Ui.pending = null;
    return activate(p);
  }
  try {
    await YM.Store.ready;
    YM.Store.openSettings();
  } catch (err) {
    YM.log.error('could not open settings', err);
  }
};

YM.dom.css.set('settings-ui', `
.settings.ym-active .settings-main>:not(.ym-panel){display:none!important}
.settings.ym-active .settings-nav button.active:not(.ym-nav-btn){background:transparent;color:var(--text-muted)}
.ym-panel h2{margin:0 0 12px;font-size:20px}
.ym-panel h3{margin:18px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)}
.ym-panel p{margin:0 0 10px}
.ym-hint{color:var(--text-muted);font-size:12px}
.ym-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}
.ym-toolbar .ym-input{flex:1;min-width:160px}
.ym-input{background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font:inherit;min-width:0}
.ym-input:focus{outline:2px solid var(--accent-soft);border-color:var(--accent)}
.ym-narrow{flex:0 0 auto!important;min-width:110px!important}
.ym-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px;width:100%;box-sizing:border-box;resize:vertical}
.ym-pre{white-space:pre-wrap;overflow:auto;max-height:46vh;padding:10px;background:var(--bg-input);border-radius:8px;border:1px solid var(--border)}
.ym-btn{background:var(--accent);color:var(--on-accent);border-radius:8px;padding:8px 14px;font-weight:600;font-size:13px;cursor:pointer}
.ym-btn:hover{background:var(--accent-hover)}
.ym-btn-ghost{background:var(--bg-elev);color:var(--text)}.ym-btn-ghost:hover{background:var(--bg-hover)}
.ym-btn-danger{background:color-mix(in srgb,var(--danger) 85%,#000)}.ym-btn-danger:hover{background:var(--danger)}
.ym-btn-small{padding:5px 10px;font-size:12px}
.ym-list{display:flex;flex-direction:column;gap:10px;margin:10px 0}
.ym-card{background:var(--bg-elev);border:1px solid var(--border);border-radius:10px;padding:12px 14px}
.ym-card.on{border-color:color-mix(in srgb,var(--success) 45%,var(--border))}
.ym-card-row{display:flex;justify-content:space-between;align-items:center;gap:10px}
.ym-card-row code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ym-card-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
.ym-card-title{display:flex;flex-direction:column;gap:2px;min-width:0}
.ym-tags{font-size:11px;color:var(--text-faint)}
.ym-card-desc{margin:6px 0 8px;color:var(--text-muted);font-size:13px;line-height:1.4}
.ym-card-foot{display:flex;justify-content:space-between;align-items:center;gap:8px}
.ym-card-foot-end{justify-content:flex-end}
.ym-options{margin-top:10px;border-top:1px solid var(--border);padding-top:6px;display:flex;flex-direction:column;gap:2px}
.ym-opt{display:flex;flex-direction:column;gap:6px;padding:8px 0;border-bottom:1px solid var(--border)}
.ym-custom{flex-direction:row;align-items:center;gap:10px;flex-wrap:wrap}
.ym-empty{padding:18px;text-align:center;color:var(--text-muted)}
.ym-error{margin:6px 0;padding:8px 10px;border-radius:8px;background:color-mix(in srgb,var(--danger) 18%,transparent);color:var(--danger);font-size:12.5px}
.ym-nav-btn{white-space:nowrap}
.ym-restart{display:flex;flex-direction:column;gap:6px;margin:0 0 14px;padding:14px 16px;border-radius:10px;border:1px solid #f0a020;background:#352c20;color:#f2f3f5}
.ym-restart[hidden]{display:none}
.ym-restart b{font-size:15px}
.ym-restart span{font-size:13px;margin-bottom:6px}
.ym-restart-btn{border-radius:8px;padding:10px 14px;background:#ffc96b;color:#fff;font-weight:700;font-size:14px;cursor:pointer;text-align:center}
.ym-restart-btn:hover{background:#ffd689}
.ym-lay-row{display:flex;gap:8px;margin:8px 0}
.ym-lay-tile{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 8px;border-radius:10px;background:var(--bg-elev);border:1px solid var(--border);text-align:center}
.ym-lay-rail{flex:.6}.ym-lay-sidebar{flex:.9}.ym-lay-main{flex:2}
.ym-lay-arrows{display:flex;gap:6px}.ym-lay-arrows .ym-btn[disabled]{opacity:.35;cursor:default}
.ym-lay-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.ym-lay-val{color:var(--text-muted);font-size:12px;font-variant-numeric:tabular-nums}
.ym-range{width:100%;accent-color:var(--accent)}
.ym-updater-status{font-size:15px;font-weight:600;margin:4px 0 8px}
.ym-icon-row{display:flex;flex-direction:column;gap:6px;width:100%}
.ym-toast-btn{margin-left:10px;padding:4px 10px;border-radius:7px;background:var(--accent,#5865f2);color:var(--on-accent,#fff);font-weight:700;font-size:12px;cursor:pointer}
`);

YM.dom.css.set('settings-ui-yapp', `
/* Yap++-style theme (theme-aware: follows Yapper's own light/dark colors). */
.settings.ym-active .ym-panel{border-radius:0 12px 12px 0;padding:22px 24px;background:color-mix(in srgb,#7c5cbf 7%,var(--bg-main))}
.ym-nav-label{font-size:11px!important;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)!important}
.ym-nav-btn{display:block;width:100%;box-sizing:border-box;text-align:left;padding:8px 12px;margin:2px 0;border-radius:9px;border:1px solid transparent;background:transparent;color:var(--text);font:inherit;cursor:pointer}
.ym-nav-btn:hover{background:rgba(255,255,255,.07)}
.ym-nav-btn.active{border-color:var(--text);background:color-mix(in srgb,currentColor 10%,transparent);color:#e87fb3;font-weight:700}
.ym-hero h1{margin:0;font-size:30px;font-weight:800;color:var(--text);letter-spacing:-.01em}
.ym-hero p{margin:2px 0 0;color:var(--text);font-size:14px;font-weight:500}
.ym-hero-div{height:1px;background:var(--border);margin:14px 0 18px}
.ym-sec{margin:18px 0 4px!important;font-size:12px!important;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)!important}
.ym-about p{margin:4px 0;color:var(--text)}
.ym-plug{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding:12px 2px;border-bottom:1px solid var(--border)}
.ym-plug-body{flex:1;min-width:180px}
.ym-plug-name{font-weight:700;color:var(--text);font-size:14px}
.ym-plug-desc{color:var(--text-muted);font-size:12.5px;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ym-plug-tags{color:var(--text-faint);font-size:11px;margin-top:2px}
.ym-plug-switch{flex:none;cursor:pointer;display:inline-flex}
.ym-plug-foot{flex-basis:100%;display:flex;justify-content:flex-end}
.ym-plug .ym-options{flex-basis:100%}
.ym-panel input.switch{-webkit-appearance:none;appearance:none;width:40px;height:22px;border-radius:999px;background-color:#3a3f4d;background-image:radial-gradient(circle 7px at 12px 50%, #fff 98%, transparent);background-repeat:no-repeat;cursor:pointer;transition:background-color .15s;flex:none;margin:0;padding:0;border:none}
.ym-panel input.switch:checked{background-color:#e88bb8;background-image:radial-gradient(circle 7px at 28px 50%, #fff 98%, transparent)}
.ym-seg-btn.on{background:#e88bb8!important;color:#fff!important}
`);

YM.dom.css.set('settings-ui-cats', `
.ym-panel{--r:12px}
.ym-page-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px}
.ym-page-head h2{margin:0;font-size:22px;letter-spacing:-.01em}
.ym-summary{color:var(--text-muted);font-size:13px}
.ym-seg{display:inline-flex;padding:3px;border-radius:10px;background:var(--bg-input);border:1px solid var(--border);flex:none}
.ym-seg-btn{padding:5px 14px;border-radius:7px;font-size:13px;font-weight:600;color:var(--text-muted);cursor:pointer;background:transparent;transition:background .15s,color .15s}
.ym-seg-btn:hover{color:var(--text)}
.ym-seg-btn.on{background:var(--accent);color:var(--on-accent)}
.ym-chips{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 12px}
.ym-chip-btn{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;color:var(--text);background:color-mix(in srgb,hsl(var(--hue) 70% 55%) 12%,var(--bg-elev));border:1px solid color-mix(in srgb,hsl(var(--hue) 70% 55%) 30%,transparent);transition:transform .12s,background .15s}
.ym-chip-btn em{font-style:normal;color:var(--text-muted);font-weight:500}
.ym-chip-btn:hover{transform:translateY(-1px)}
.ym-chip-btn.on{background:hsl(var(--hue) 65% 48%);color:#fff;border-color:transparent}.ym-chip-btn.on em{color:#ffffffc0}
.ym-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;align-items:start}
.ym-grid .ym-empty{grid-column:1/-1}
.ym-card{--hue:220;position:relative;border-radius:var(--r);padding:14px 14px 12px 16px;overflow:hidden;transition:border-color .2s,box-shadow .2s}
.ym-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:hsl(var(--hue) 65% 55%);opacity:.35;transition:opacity .2s}
.ym-card.on::before{opacity:1}
.ym-card.on{border-color:var(--border);box-shadow:0 0 0 1px color-mix(in srgb,hsl(var(--hue) 65% 55%) 35%,transparent)}
.ym-card-head{align-items:flex-start}
.ym-card-title{flex:1;gap:4px;padding-top:1px}
.ym-card-title b{font-size:14.5px;overflow:hidden;text-overflow:ellipsis}
.ym-tags{display:flex;flex-wrap:wrap;gap:4px}
.ym-tags i{font-style:normal;font-size:11px;padding:1px 7px;border-radius:999px;background:var(--bg-input);color:var(--text-muted)}
.ym-card-desc{margin:10px 0 8px;line-height:1.45}
.ym-options{border-top:1px dashed var(--border)}
.ym-opt{border-bottom:0;padding:9px 0}
.ym-btn{border-radius:9px;transition:background .15s,transform .08s}
.ym-btn:active{transform:translateY(1px)}
.ym-btn:focus-visible,.ym-seg-btn:focus-visible,.ym-chip-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ym-input{border-radius:10px}
.ym-restart{border-radius:var(--r)}
@media (prefers-reduced-motion:reduce){.ym-card,.ym-card::before,.ym-btn,.ym-chip-btn,.ym-seg-btn{transition:none}}

`);
