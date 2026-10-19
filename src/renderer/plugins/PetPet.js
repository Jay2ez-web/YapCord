// PetPet (port of Vencord's /petpet command).
//
//   /petpet                     pet yourself
//   /petpet user:@alice         pet someone's avatar
//   /petpet url:https://...     pet a picture from the web
//   /petpet image               pick a picture from your computer (choose "image" in the option list)
//   ... delay:20 resolution:128 how fast and how big
//
// The GIF is made right here from the same ten hand pictures Vencord uses (see 067-petpet-frames.js), laid out with the same
// numbers as Vencord's plugin, and added to your message as an attachment; press Enter again to send it. Nothing is uploaded
// to a website: the only download is the avatar or picture that you asked for.
(function () {
  const COMMAND = 'petpet';
  const FRAMES = 10;
  const DEFAULT_DELAY = 20; // ms; Chromium and Firefox play frames shorter than 20 ms too slowly
  const DEFAULT_RESOLUTION = 128;
  const MIN_RESOLUTION = 16;
  const MAX_RESOLUTION = 512;
  const MAX_DELAY = 10000;

  // the same options Vencord shows (without "no-server-pfp": Yapper has no server-specific avatars)
  const OPTIONS = [
    { name: 'delay', description: 'The delay between each frame in ms. Rounded to nearest 10ms. Defaults to the minimum value of 20.' },
    { name: 'resolution', description: 'Resolution for the gif. Defaults to 128. If you enter an insane number and it freezes Yapper that\'s your fault.' },
    { name: 'image', description: 'Image attachment to use' },
    { name: 'url', description: 'URL to fetch image from' },
    { name: 'user', description: 'User whose avatar to use as image' },
  ];
  const IMAGE_OPTIONS = ['image', 'url', 'user'];
  const IGNORED = ['no-server-pfp']; // accepted so that a command copied from Discord still works
  const KNOWN = OPTIONS.map((o) => o.name).concat(IGNORED);

  // ---- reading the command ---------------------------------------------------------------------------

  const unquote = (v) => (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"' ? v.slice(1, -1) : v);

  /** "user:@alice delay:20 https://x" -> { options: [{name,value}], bare: ['https://x'] }. Values may be written "in quotes". */
  function parseArgs(rest) {
    const options = [];
    const bare = [];
    const re = /(?:[a-z-]+:)?"[^"]*"|\S+/gi;
    let m;
    while ((m = re.exec(String(rest || '')))) {
      const o = /^([a-z-]+):([\s\S]*)$/i.exec(m[0]);
      if (o && KNOWN.includes(o[1].toLowerCase())) options.push({ name: o[1].toLowerCase(), value: unquote(o[2]) });
      else bare.push(unquote(m[0]));
    }
    return { options, bare };
  }

  /** "/petpet user:@alice" -> { arg, options, bare } (null when the text is something else, or has more than one line). */
  function parseCommand(text) {
    const m = /^\/petpet(?:\s+([^\n]*))?$/i.exec(String(text || '').trim());
    if (!m) return null;
    const arg = (m[1] || '').trim();
    return { arg, ...parseArgs(arg) };
  }

  /** "/p", "/pet", "/petpe" ... (not the whole word): the user is still typing the command name. */
  function isPartial(text) {
    const m = /^\/([a-z]{1,6})$/i.exec(String(text || '').trim());
    return !!m && COMMAND.startsWith(m[1].toLowerCase()) && m[1].toLowerCase() !== COMMAND;
  }

  function wholeNumber(value) {
    return /^\d{1,6}$/.test(String(value).trim()) ? Number(String(value).trim()) : NaN;
  }

  /**
   * Turns a parsed command into what has to be made, or an { error } to show.
   * defaults: { delay, resolution } from the plugin settings. Result: { kind: 'self'|'user'|'url'|'image', value, delay, resolution }.
   */
  function buildPlan(cmd, defaults) {
    const opt = {};
    for (const o of cmd.options) opt[o.name] = o.value; // the last one wins
    let delay = defaults.delay;
    let resolution = defaults.resolution;
    if ('delay' in opt) {
      delay = wholeNumber(opt.delay);
      if (Number.isNaN(delay)) return { error: 'delay must be a number, received "' + opt.delay + '"' };
      if (delay < DEFAULT_DELAY) return { error: 'Delay must be at least ' + DEFAULT_DELAY + '.' };
      if (delay > MAX_DELAY) return { error: 'Delay can be at most ' + MAX_DELAY + ' ms.' };
    }
    if ('resolution' in opt) {
      resolution = wholeNumber(opt.resolution);
      if (Number.isNaN(resolution) || resolution < MIN_RESOLUTION || resolution > MAX_RESOLUTION) {
        return { error: 'resolution must be a whole number from ' + MIN_RESOLUTION + ' to ' + MAX_RESOLUTION + ', received "' + opt.resolution + '"' };
      }
    }
    const given = IMAGE_OPTIONS.filter((n) => n in opt).map((n) => ({ kind: n, value: opt[n] }));
    const bare = cmd.bare.join(' ').trim();
    if (bare) given.push(/^https?:\/\//i.test(bare) ? { kind: 'url', value: bare } : { kind: 'user', value: bare }); // "/petpet @alice" still works
    if (given.length > 1) return { error: 'You can only specify one of the image options (image, url or user).' };
    const src = given[0] || { kind: 'self', value: '' };
    if (src.kind === 'url' && !/^https:\/\/[^\s/]+/i.test(src.value)) return { error: 'The url must start with https://' };
    if ((src.kind === 'user' || src.kind === 'image') && !String(src.value).trim()) {
      return { error: src.kind === 'user' ? 'Say whose avatar to use: /petpet user:@username' : 'Choose "image" in the option list to pick a picture.' };
    }
    return { kind: src.kind, value: src.value, delay, resolution };
  }

  /** Find a person among `profiles` by "@username", "username", display name (exact first, then prefix, then contains) or <@id>. */
  function pickProfile(arg, profiles, byId) {
    let q = String(arg || '').trim();
    const mention = /^<@!?([^>\s]+)>$/.exec(q);
    if (mention) return byId(mention[1]) || null;
    q = q.replace(/^@/, '').trim().toLowerCase();
    if (!q) return null;
    const name = (p) => String(p.username || '').toLowerCase();
    const shown = (p) => String(p.display_name || '').toLowerCase();
    const tests = [
      (p) => name(p) === q || shown(p) === q,
      (p) => name(p).startsWith(q) || shown(p).startsWith(q),
      (p) => name(p).includes(q) || shown(p).includes(q),
    ];
    for (const t of tests) {
      const hit = profiles.find(t);
      if (hit) return hit;
    }
    return null;
  }

  /** Up to `limit` people for the suggestion list: exact matches, then names that start with the text, then names that contain it. */
  function matchPeople(query, profiles, limit = 8) {
    const q = String(query || '').replace(/^@/, '').trim().toLowerCase();
    if (!q) return profiles.slice(0, limit);
    const name = (p) => String(p.username || '').toLowerCase();
    const shown = (p) => String(p.display_name || '').toLowerCase();
    const rank = (p) => (name(p) === q || shown(p) === q ? 0 : name(p).startsWith(q) || shown(p).startsWith(q) ? 1 : name(p).includes(q) || shown(p).includes(q) ? 2 : 3);
    return profiles.map((p, i) => ({ p, r: rank(p), i })).filter((x) => x.r < 3).sort((a, b) => a.r - b.r || a.i - b.i).slice(0, limit).map((x) => x.p);
  }

  /**
   * What the suggestion list should show for the text in the message box (null = nothing).
   * { mode: 'command'|'options'|'people'|'hint', start (where the word being typed begins), token, query, items }
   */
  function analyse(text, profiles) {
    text = String(text || '');
    if (text.includes('\n')) return null;
    if (isPartial(text) || /^\/petpet$/i.test(text)) return { mode: 'command', start: 0, token: text, query: '', items: [{ kind: 'command' }] };
    if (!/^\/petpet\s/i.test(text)) return null;
    const cut = Math.max(text.lastIndexOf(' '), text.lastIndexOf('\t')) + 1;
    const token = text.slice(cut);
    const before = parseArgs(text.slice(COMMAND.length + 1, cut));
    const used = new Set(before.options.map((o) => o.name));
    const imageTaken = IMAGE_OPTIONS.some((n) => used.has(n)) || before.bare.length > 0;
    const available = OPTIONS.filter((o) => !used.has(o.name) && !(imageTaken && IMAGE_OPTIONS.includes(o.name)));
    const people = (query, extra) => ({ mode: 'people', start: cut, token, query, items: matchPeople(query, profiles).map((p) => ({ kind: 'person', profile: p })), ...extra });
    const colon = token.indexOf(':');
    if (colon > 0) {
      const name = token.slice(0, colon).toLowerCase();
      const value = token.slice(colon + 1).replace(/^"/, '');
      if (name === 'user') return people(value.replace(/^@/, ''), { viaOption: true });
      const option = OPTIONS.find((o) => o.name === name);
      return option ? { mode: 'hint', start: cut, token, query: value, items: [], option } : null;
    }
    const prefix = token.toLowerCase();
    const options = available.filter((o) => o.name.startsWith(prefix));
    if (options.length) return { mode: 'options', start: cut, token, query: prefix, items: options.map((o) => ({ kind: 'option', option: o })) };
    if (!token || imageTaken) return null;
    const found = people(token.replace(/^@/, ''), {});
    return found.items.length ? found : null;
  }

  /** Should Enter choose the highlighted entry (true) or run the command (false)? Tab always chooses. */
  function enterPicks(view, text) {
    if (!view || !view.items.length) return false;
    if (view.touched) return true; // the arrow keys were used: the user is choosing
    if (view.mode === 'command') return isPartial(text);
    if (view.mode === 'options') return view.token !== '';
    if (view.mode === 'people') {
      if (!view.query) return view.viaOption === true; // "user:" with nothing after it: pick someone
      const sel = view.items[view.index || 0];
      return !(sel && sel.kind === 'person' && String(sel.profile.username || '').toLowerCase() === view.query.toLowerCase());
    }
    return false;
  }

  // ---- hands, avatar, GIF ----------------------------------------------------------------------------

  let handsPromise = null;
  /** The ten hand pictures, decoded once. */
  function getHands() {
    if (!handsPromise) {
      const list = Array.isArray(YM.petpetFrames) ? YM.petpetFrames : [];
      handsPromise = Promise.all(list.map((b64) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return createImageBitmap(new Blob([bytes], { type: 'image/gif' }));
      })).then((hands) => {
        if (hands.length !== FRAMES) throw new Error('the hand pictures are missing');
        return hands;
      });
      handsPromise.catch(() => { handsPromise = null; }); // try again next time
    }
    return handsPromise;
  }

  /**
   * One RGBA frame per hand picture. The avatar is squashed while the hand presses down and springs back, with the very
   * numbers that Vencord's petpet plugin uses (so the result is the same GIF).
   */
  function renderFrames(source, size, hands) {
    const S = size;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    const frames = [];
    for (let i = 0; i < FRAMES; i++) {
      const j = i < FRAMES / 2 ? i : FRAMES - i;
      const width = 0.8 + j * 0.02;
      const height = 0.8 - j * 0.05;
      const offsetX = (1 - width) * 0.5 + 0.1;
      const offsetY = 1 - height - 0.08;
      c.clearRect(0, 0, S, S);
      c.drawImage(source, offsetX * S, offsetY * S, width * S, height * S);
      c.drawImage(hands[i], 0, 0, S, S);
      frames.push(c.getImageData(0, 0, S, S).data);
    }
    return frames;
  }

  /** A placeholder for people without a picture (or whose picture could not be read). */
  function letterAvatar(profile, S = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const c = canvas.getContext('2d');
    const seed = String(profile.id || profile.username || '?');
    let hue = 0;
    for (let i = 0; i < seed.length; i++) hue = (hue * 31 + seed.charCodeAt(i)) % 360;
    c.fillStyle = 'hsl(' + hue + ',55%,45%)';
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#fff';
    c.font = '700 ' + S * 0.55 + 'px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(profile.display_name || profile.username || '?').trim().charAt(0).toUpperCase() || '?', S / 2, S / 2 + S * 0.03);
    return canvas;
  }

  /** Downloads a picture and decodes it. */
  async function fetchBitmap(url) {
    let blob;
    try {
      const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      blob = await res.blob();
    } catch (corsErr) {
      // The file host may not allow other sites to read its pictures: inside the app the download is done by the app itself
      // (only for Yapper's own picture hosts).
      if (!(YM.inApp && YM.native.net && YM.native.net.image)) throw corsErr;
      const got = await YM.native.net.image(url.startsWith('/') ? location.origin + url : url);
      blob = new Blob([got.data], { type: got.type });
    }
    return createImageBitmap(blob);
  }

  async function loadAvatar(profile) {
    const mod = YM.finder.findExports(['publicUrl']);
    const url = profile.avatar_path && mod ? mod.publicUrl('avatars', profile.avatar_path) : null;
    if (!url) return { image: letterAvatar(profile), fallback: true };
    try {
      return { image: await fetchBitmap(url), fallback: false };
    } catch (err) {
      YM.log.warn('PetPet: could not load the avatar, using a letter instead', err && err.message);
      return { image: letterAvatar(profile), fallback: true, failed: true };
    }
  }

  /** Lets the person choose a picture on their computer (the app's own dialog inside YapCord). Resolves to null when cancelled. */
  function chooseImageFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', () => resolve((input.files && input.files[0]) || null));
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  // ---- plugin ----------------------------------------------------------------------------------------
  YM.definePlugin({
    name: 'PetPet',
    description: 'Adds the /petpet command: pet someone\'s avatar (user), a picture from the web (url) or one from your computer (image), and attach the GIF to your message.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Fun', 'Chat'],
    options: {
      size: { type: 'number', default: DEFAULT_RESOLUTION, min: MIN_RESOLUTION, max: MAX_RESOLUTION, description: 'Default size of the GIF in pixels (the resolution option of the command overrides it)' },
      delay: { type: 'number', default: DEFAULT_DELAY, min: DEFAULT_DELAY, max: 1000, description: 'Default milliseconds per frame, at least 20 (the delay option of the command overrides it)' },
    },
    // exposed for tests and for other plugins
    parseCommand,
    parseArgs,
    buildPlan,
    analyse,
    enterPicks,
    isPartial,
    pickProfile,
    matchPeople,
    renderFrames,
    getHands,

    start(ctx) {
      const h = YM.dom.h;
      let busy = false;
      let menu = null;
      let view = null; // what the suggestion list shows now (see analyse) + index + touched
      let dismissed = null; // text for which Escape closed the list
      let picked = null; // { name, file } chosen with the "image" option

      const state = () => (YM.Store.isReady ? YM.Store.getState() : null);
      function people() {
        const st = state();
        if (!st) return [];
        const out = new Map();
        const add = (id) => {
          const p = id && st.profiles && st.profiles[id];
          if (p) out.set(id, p);
        };
        add(st.userId);
        const members = st.serverMembers && st.serverMembers[st.activeServerId];
        if (Array.isArray(members)) members.forEach(add);
        const msgs = st.messages && st.messages[st.activeChannelId];
        if (Array.isArray(msgs)) msgs.forEach((m) => add(m && m.author_id));
        return [...out.values()];
      }

      function setText(ta, value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, value);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.setSelectionRange(value.length, value.length);
      }

      function attach(file) {
        const input = document.querySelector('.composer input[type=file]');
        if (!input) return false;
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      // ---- the suggestion list (same look as Yapper's own command list) ------------------------------
      function hideMenu() {
        if (menu) menu.remove();
        menu = null;
      }

      function row(item, i, ta) {
        const on = i === view.index;
        const props = { type: 'button', role: 'option', 'aria-selected': on ? 'true' : 'false', class: on ? 'on' : '', onMouseDown: (e) => { e.preventDefault(); pick(ta, item); } };
        if (item.kind === 'command') {
          return h('button', props,
            h('span', { class: 'mention-all' }, '/'),
            h('span', {}, COMMAND),
            h('span', { class: 'hint cmd-desc' }, 'Create a petpet gif. You can only specify one of the image options'),
            h('span', { class: 'hint cmd-bot' }, 'YapCord'));
        }
        if (item.kind === 'option') {
          return h('button', props, h('span', {}, item.option.name), h('span', { class: 'hint cmd-desc' }, item.option.description));
        }
        const p = item.profile;
        return h('button', props, h('span', {}, p.display_name || p.username || '?'), h('span', { class: 'hint cmd-desc' }, '@' + (p.username || '')));
      }

      function renderMenu(ta) {
        const composer = ta.closest('.composer');
        if (!composer || !view) return hideMenu();
        const title = { command: 'Commands', options: 'Options', hint: 'Options', people: 'Members' }[view.mode];
        const body = view.mode === 'hint'
          ? [h('div', { class: 'ym-cmd-hint' }, h('b', {}, view.option.name), ' ' + view.option.description)]
          : view.items.map((item, i) => row(item, i, ta));
        const next = h('div', { class: 'mention-menu ym-cmd-menu', role: 'listbox' }, h('div', { class: 'emoji-section', style: { padding: '6px 10px 4px' } }, title), ...body);
        if (menu && menu.parentElement === composer) menu.replaceWith(next);
        else {
          hideMenu();
          composer.append(next);
        }
        menu = next;
        const current = menu.querySelector('button.on');
        if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest' });
      }

      /** Works out what to suggest for what is typed (keeps the highlighted entry while the same word is being typed). */
      function compute(ta) {
        if (!(ta instanceof HTMLTextAreaElement) || !ta.closest('.composer')) return null;
        const text = ta.value;
        let next = null;
        if (text[0] === '/' && !(dismissed !== null && dismissed === text)) {
          next = analyse(text, people());
          if (next && next.mode !== 'hint' && !next.items.length) next = null;
        }
        if (!next) {
          view = null;
          return null;
        }
        const same = view && view.mode === next.mode && view.token === next.token;
        next.index = same ? Math.min(view.index, Math.max(0, next.items.length - 1)) : 0;
        next.touched = same ? view.touched : false;
        view = next;
        return view;
      }

      function refresh(ta) {
        const cur = compute(ta);
        if (cur) renderMenu(ta);
        else hideMenu();
        return cur;
      }

      // ---- choosing an entry ---------------------------------------------------------------------------
      function replaceWord(ta, replacement) {
        const v = ta.value;
        const cut = Math.max(v.lastIndexOf(' '), v.lastIndexOf('\t')) + 1;
        setText(ta, v.slice(0, cut) + replacement);
      }

      async function chooseImage(ta) {
        const file = await chooseImageFile();
        if (!file) return;
        picked = { name: file.name, file };
        replaceWord(ta, 'image:' + (/\s/.test(file.name) ? '"' + file.name + '"' : file.name) + ' ');
        ta.focus();
      }

      function pick(ta, item) {
        if (!item) return;
        dismissed = null;
        if (item.kind === 'command') setText(ta, '/' + COMMAND + ' ');
        else if (item.kind === 'option') {
          if (item.option.name === 'image') chooseImage(ta);
          else replaceWord(ta, item.option.name + ':');
        } else if (item.kind === 'person') replaceWord(ta, 'user:@' + (item.profile.username || item.profile.id) + ' ');
        ta.focus();
      }

      // ---- running the command -------------------------------------------------------------------------
      async function run(ta) {
        if (busy) return;
        const cmd = parseCommand(ta.value);
        if (!cmd) return;
        const s = ctx.settings.store;
        const plan = buildPlan(cmd, {
          delay: YM.util.clamp(Math.round(Number(s.delay) || DEFAULT_DELAY), DEFAULT_DELAY, 1000),
          resolution: YM.util.clamp(Math.round(Number(s.size) || DEFAULT_RESOLUTION), MIN_RESOLUTION, MAX_RESOLUTION),
        });
        if (plan.error) return YM.toast(plan.error, { type: 'error' });
        busy = true;
        try {
          let image;
          let failed = false;
          if (plan.kind === 'self' || plan.kind === 'user') {
            const all = people();
            const byId = (id) => all.find((p) => p.id === id) || null;
            const target = plan.kind === 'self' ? YM.Store.me() : pickProfile(plan.value, all, byId);
            if (!target) {
              YM.toast(plan.kind === 'self' ? 'Could not work out who you are yet.' : 'Could not find "' + String(plan.value).replace(/^@/, '') + '" here. Try /petpet user:@username.', { type: 'error' });
              return;
            }
            const got = await loadAvatar(target);
            image = got.image;
            failed = !!got.failed;
          } else if (plan.kind === 'url') {
            try {
              image = await fetchBitmap(plan.value);
            } catch (err) {
              YM.log.warn('PetPet: could not load the url', err && err.message);
              YM.toast('Could not load that picture. The website may not allow YapCord to read it: save the picture and use the image option instead.', { type: 'error' });
              return;
            }
          } else {
            if (!picked || picked.name !== plan.value) {
              YM.toast('Choose the picture again: pick "image" in the option list.', { type: 'error' });
              return;
            }
            try {
              image = await createImageBitmap(picked.file);
            } catch (err) {
              YM.toast(plan.value + ' is not a picture YapCord can read.', { type: 'error' });
              return;
            }
          }
          const hands = await getHands();
          const frames = renderFrames(image, plan.resolution, hands);
          const bytes = YM.gif.encode({ width: plan.resolution, height: plan.resolution, frames, delayMs: plan.delay, loop: 0 });
          const file = new File([bytes], 'petpet.gif', { type: 'image/gif', lastModified: Date.now() });
          if (!attach(file)) {
            YM.toast('There is no message box to attach the petpet to.', { type: 'error' });
            return;
          }
          picked = null;
          setText(ta, '');
          hideMenu();
          view = null;
          YM.toast(failed ? 'petpet ready (their picture could not be loaded, so a letter is used). Press Enter to send.' : 'petpet ready: press Enter to send it.', { type: 'success' });
        } catch (err) {
          YM.log.error('PetPet failed', err);
          YM.toast('Could not make the petpet: ' + (err && err.message ? err.message : err), { type: 'error' });
        } finally {
          busy = false;
        }
      }

      const stop = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      const onKey = (e) => {
        const ta = e.target;
        if (!(ta instanceof HTMLTextAreaElement) || !ta.closest('.composer') || e.isComposing) return;
        const cur = compute(ta);
        if (cur && cur.items.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
          stop(e);
          const n = cur.items.length;
          cur.index = (cur.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
          cur.touched = true;
          renderMenu(ta);
          return;
        }
        if (cur && e.key === 'Escape') {
          stop(e);
          dismissed = ta.value;
          hideMenu();
          view = null;
          return;
        }
        if (cur && cur.items.length && e.key === 'Tab' && !e.shiftKey) {
          stop(e);
          pick(ta, cur.items[cur.index]);
          return;
        }
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
        if (cur && enterPicks(cur, ta.value)) {
          stop(e);
          pick(ta, cur.items[cur.index]);
          return;
        }
        if (!parseCommand(ta.value)) return;
        stop(e);
        run(ta);
      };
      const onInput = (e) => refresh(e.target);
      const onFocusOut = (e) => {
        if (e.target instanceof HTMLTextAreaElement) setTimeout(hideMenu, 120);
      };
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('input', onInput, true);
      document.addEventListener('focusout', onFocusOut, true);
      ctx.cleanup(() => {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('input', onInput, true);
        document.removeEventListener('focusout', onFocusOut, true);
        hideMenu();
        view = null;
        picked = null;
      });
      ctx.css('.composer>.ym-cmd-menu{position:absolute;left:16px;right:16px;bottom:100%;margin-bottom:-14px;z-index:30;max-height:280px;overflow-y:auto}'
        + '.ym-cmd-menu .ym-cmd-hint{padding:6px 12px 10px;font-size:13px;color:var(--text-muted)}'
        + '.ym-cmd-menu .ym-cmd-hint b{color:var(--text)}');
    },
  });
})();
