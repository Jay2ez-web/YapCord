// ProfileSets: save local display-name/bio templates and copy them for manual use.
// It never edits the Yapper account, calls an API, or changes the renderer store.
(function () {
  const KEY = 'pluginData.ProfileSets';
  const MAX_PRESETS = 20;
  const MAX_NAME = 40;
  const MAX_DISPLAY_NAME = 80;
  const MAX_BIO = 1000;

  function cleanText(value, limit) {
    return String(value == null ? '' : value).replace(/\r\n/g, '\n').trim().slice(0, limit);
  }

  function read() {
    const raw = YM.settings.get(KEY, []);
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const name = cleanText(item.name, MAX_NAME);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push({ name, displayName: cleanText(item.displayName, MAX_DISPLAY_NAME), bio: cleanText(item.bio, MAX_BIO) });
      if (out.length >= MAX_PRESETS) break;
    }
    return out;
  }

  function save(name, displayName, bio) {
    const label = cleanText(name, MAX_NAME);
    if (!label) return false;
    const presets = read();
    const item = { name: label, displayName: cleanText(displayName, MAX_DISPLAY_NAME), bio: cleanText(bio, MAX_BIO) };
    const index = presets.findIndex((preset) => preset.name.toLowerCase() === label.toLowerCase());
    if (index >= 0) presets[index] = item;
    else if (presets.length < MAX_PRESETS) presets.push(item);
    else return false;
    YM.settings.set(KEY, presets);
    return item;
  }

  function remove(name) {
    const key = cleanText(name, MAX_NAME).toLowerCase();
    const presets = read();
    const next = presets.filter((preset) => preset.name.toLowerCase() !== key);
    if (next.length === presets.length) return false;
    YM.settings.set(KEY, next);
    return true;
  }

  function currentProfile() {
    const profile = YM.Store.me();
    if (!profile) return null;
    return { displayName: profile.display_name || '', bio: profile.bio || '' };
  }

  async function copy(value, label) {
    const ok = await YM.util.copyText(String(value || ''));
    YM.toast(ok ? label + ' copied. Paste it manually in your Yapper profile settings.' : 'Could not copy to the clipboard.', { type: ok ? 'success' : 'error' });
    return !!ok;
  }

  function openUse(preset) {
    const h = YM.dom.h;
    return YM.modal.open({
      title: 'Load profile set: ' + preset.name,
      subtitle: 'Local template · manual use only',
      body: h('div', {},
        h('div', { class: 'ym-ps-note' }, 'This set is stored on this device. Copy the values below, then paste them yourself in Yapper’s profile settings. This plugin does not change your account.'),
        h('label', { class: 'ym-ps-label' }, 'Display name', h('textarea', { class: 'input', rows: 2, readonly: true, value: preset.displayName, 'aria-label': 'Profile set display name' })),
        h('label', { class: 'ym-ps-label' }, 'Bio', h('textarea', { class: 'input', rows: 4, readonly: true, value: preset.bio, 'aria-label': 'Profile set bio' })),
      ),
      buttons: [
        { label: 'Copy display name', onClick: async () => { await copy(preset.displayName, 'Display name'); } },
        { label: 'Copy bio', onClick: async () => { await copy(preset.bio, 'Bio'); } },
        { label: 'Copy both', onClick: async () => { await copy('Display name: ' + preset.displayName + '\nBio: ' + preset.bio, 'Profile set'); } },
      ],
    });
  }

  function openEditor(preset, initial, afterSave) {
    const h = YM.dom.h;
    const values = preset || initial || currentProfile() || { displayName: '', bio: '' };
    const nameInput = h('input', { type: 'text', class: 'input', maxlength: MAX_NAME, value: preset ? preset.name : '', placeholder: 'e.g. Art account', 'aria-label': 'Profile set name' });
    const displayInput = h('input', { type: 'text', class: 'input', maxlength: MAX_DISPLAY_NAME, value: values.displayName || '', placeholder: 'Display name', 'aria-label': 'Preset display name' });
    const bioInput = h('textarea', { class: 'input', rows: 4, maxlength: MAX_BIO, value: values.bio || '', placeholder: 'Bio', 'aria-label': 'Preset bio' });
    return YM.modal.open({
      title: preset ? 'Edit profile set' : 'New profile set',
      subtitle: 'Saved locally; account changes remain manual',
      body: h('div', {},
        h('div', { class: 'ym-ps-note' }, 'Save a copyable display-name and bio template. To use it, copy the fields and paste them manually in Yapper’s own profile settings.'),
        h('label', { class: 'ym-ps-label' }, 'Set name', nameInput),
        h('label', { class: 'ym-ps-label' }, 'Display name', displayInput),
        h('label', { class: 'ym-ps-label' }, 'Bio', bioInput),
      ),
      buttons: [{ label: 'Save locally', onClick: (close) => {
        const result = save(nameInput.value, displayInput.value, bioInput.value);
        if (!result) { YM.toast('Enter a name, or remove a preset before adding more than ' + MAX_PRESETS + '.', { type: 'error' }); return; }
        YM.toast('Profile set saved locally.');
        if (afterSave) afterSave();
        close();
      } }],
    });
  }

  function renderManager(box) {
    const h = YM.dom.h;
    box.style.flexDirection = 'column';
    box.style.alignItems = 'stretch';
    const list = h('div', { class: 'ym-ps-list' });

    function draw() {
      list.replaceChildren();
      const presets = read();
      if (!presets.length) list.append(h('div', { class: 'hint' }, 'No profile sets saved yet. Create one or capture your currently loaded display name and bio.'));
      for (const preset of presets) {
        list.append(h('div', { class: 'ym-ps-row' },
          h('div', { class: 'ym-ps-summary' }, h('b', {}, preset.name), h('span', { class: 'hint' }, (preset.displayName || 'No display name') + (preset.bio ? ' · ' + preset.bio.slice(0, 70) : ''))),
          h('button', { type: 'button', class: 'ym-btn ym-btn-small', onClick: () => openUse(preset) }, 'Copy / load'),
          h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-btn-ghost', onClick: () => { openEditor(preset, null, draw); } }, 'Edit'),
          h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-btn-ghost', onClick: () => { remove(preset.name); draw(); } }, 'Delete'),
        ));
      }
    }

    box.append(
      h('div', { class: 'ym-ps-note' }, 'Profile sets are local templates for display name and bio. “Copy / load” only copies values; you apply them yourself in Yapper’s profile settings.'),
      h('div', { class: 'ym-ps-actions' },
        h('button', { type: 'button', class: 'ym-btn ym-btn-small', onClick: () => { openEditor(null, null, draw); } }, 'New profile set'),
        h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-btn-ghost', onClick: () => {
          const current = currentProfile();
          if (!current) { YM.toast('Your profile is not loaded yet.', { type: 'error' }); return; }
          openEditor(null, current, draw);
        } }, 'Capture current profile'),
      ),
      list,
    );
    draw();
  }

  YM.definePlugin({
    name: 'ProfileSets',
    description: 'Save local display-name/bio templates and copy their values for manual use. It never edits your Yapper account.',
    authors: ['YapCord'],
    tags: ['Profile', 'Utility'],
    enabledByDefault: false,
    api: { cleanText, read, save, remove, currentProfile },
    options: { manage: { type: 'custom', default: false, render: (box) => renderManager(box) } },
    start(ctx) {
      ctx.css(`
.ym-ps-note{font-size:12px;color:var(--text-faint,#92939b);line-height:1.5;margin:0 0 10px}
.ym-ps-label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;margin:8px 0}
.ym-ps-label .input{width:100%;font-weight:400}
.ym-ps-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.ym-ps-list{display:flex;flex-direction:column;gap:8px;max-height:340px;overflow:auto;width:100%}
.ym-ps-row{display:flex;align-items:center;gap:6px;border:1px solid var(--border,#343640);border-radius:8px;padding:8px}
.ym-ps-summary{flex:1;min-width:90px;display:flex;flex-direction:column;gap:3px;overflow:hidden}
.ym-ps-summary .hint{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`);
    },
  });
})();
