// CustomIcons: use your own pictures for (1) the Home button at the top of the server list (the Yapper logo) and
// (2) the app icon: the window and taskbar icon, and the tray icon.
// Pictures are shrunk to a small square on your computer and kept in your YapCord settings / data folder; nothing is uploaded.
// The icon of the .exe file itself, the Start-menu shortcut and the installer cannot be changed from inside the app.
(function () {
  const HOME_SEL = 'button.rail-item[aria-label="Direct messages"]';

  /** Draws a picture file onto a square canvas (centre crop) and returns it as a PNG data URL. */
  async function toSquarePng(file, size) {
    if (!file || !/^image\//.test(file.type || '')) throw new Error('That is not a picture.');
    if (file.size > 15 * 1024 * 1024) throw new Error('That picture is too large (over 15 MB).');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const w = img.naturalWidth || size;
      const hh = img.naturalHeight || size;
      const side = Math.min(w, hh);
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      c.getContext('2d').drawImage(img, (w - side) / 2, (hh - side) / 2, side, side, 0, 0, size, size);
      return c.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const isDataImage = (v) => typeof v === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(v) && v.length < 2000000;

  /** A "Choose picture / Remove" row with a preview. */
  function pickerRow({ title, hint, size, getPreview, onPick, onClear, clearLabel }) {
    const h = YM.dom.h;
    const box = h('div', { class: 'ym-icon-row' });
    const preview = h('img', { class: 'ym-icon-preview', alt: '', width: 40, height: 40 });
    const msg = h('span', { class: 'hint' }, '');
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true, onChange: async () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (!f) return;
      try {
        await onPick(await toSquarePng(f, size));
        msg.textContent = 'Saved.';
      } catch (err) {
        msg.textContent = '';
        YM.toast((err && err.message) || 'Could not use that picture.', { type: 'error' });
      }
      show();
    } });
    const clear = h('button', { class: 'ym-btn ym-btn-small ym-btn-ghost', type: 'button', onClick: async () => { await onClear(); msg.textContent = 'Back to the original.'; show(); } }, clearLabel || 'Remove');
    async function show() {
      const url = await getPreview();
      if (url) preview.setAttribute('src', url); else preview.removeAttribute('src');
      preview.style.visibility = url ? 'visible' : 'hidden';
      clear.disabled = !url;
    }
    box.append(
      h('div', { class: 'toggle-label' }, title),
      hint ? h('div', { class: 'hint' }, hint) : null,
      h('div', { class: 'ym-toolbar', style: { alignItems: 'center' } }, preview, h('button', { class: 'ym-btn ym-btn-small', type: 'button', onClick: () => input.click() }, 'Choose picture...'), clear, msg),
      input);
    show();
    return box;
  }

  YM.definePlugin({
    name: 'CustomIcons',
    description: 'Use your own picture for the Home button in the server list and for the app icon (window, taskbar and tray).',
    authors: ['YapCord'],
    tags: ['Appearance', 'Customisation'],
    api: { toSquarePng, isDataImage },
    options: {
      homeIcon: {
        type: 'custom',
        default: '',
        render(box, plugin) {
          box.append(pickerRow({
            title: 'Home button picture',
            hint: 'Replaces the Yapper logo at the top of the server list.',
            size: 128,
            getPreview: async () => (isDataImage(plugin.settings.store.homeIcon) ? plugin.settings.store.homeIcon : ''),
            onPick: async (url) => plugin.settings.set('homeIcon', url),
            onClear: async () => plugin.settings.set('homeIcon', ''),
          }));
        },
      },
      appIcon: {
        type: 'custom',
        default: false,
        render(box) {
          if (!YM.inApp || !YM.native.icon) {
            box.append(YM.dom.h('div', { class: 'hint' }, 'The app icon can only be changed inside the app.'));
            return;
          }
          box.append(pickerRow({
            title: 'App icon',
            hint: 'Window, taskbar and tray icon. Windows may show the new picture only after a moment. The icon of the .exe file itself does not change.',
            size: 256,
            getPreview: async () => { try { return (await YM.native.icon.state()).preview || ''; } catch (_) { return ''; } },
            onPick: async (url) => { await YM.native.icon.setApp(url); },
            onClear: async () => { await YM.native.icon.clearApp(); },
            clearLabel: 'Back to the original',
          }));
        },
      },
    },
    start(ctx) {
      const h = YM.dom.h;
      ctx.css(`${HOME_SEL}[data-ym-home]>:not(.ym-home-icon){display:none!important}
${HOME_SEL}>.ym-home-icon{display:block;width:100%;height:100%;object-fit:cover}
.ym-icon-preview{width:40px;height:40px;border-radius:10px;object-fit:cover;background:rgba(255,255,255,.06)}`);

      const apply = (btn) => {
        const url = ctx.settings.store.homeIcon;
        let img = btn.querySelector(':scope > .ym-home-icon');
        if (isDataImage(url)) {
          if (!img) {
            img = h('img', { class: 'ym-home-icon', alt: '', draggable: 'false' });
            btn.append(img);
          }
          if (img.getAttribute('src') !== url) img.setAttribute('src', url);
          if (!btn.hasAttribute('data-ym-home')) btn.setAttribute('data-ym-home', '1');
        } else {
          if (img) img.remove();
          btn.removeAttribute('data-ym-home');
        }
      };
      const all = () => document.querySelectorAll(HOME_SEL).forEach(apply);
      all();
      ctx.onMutate(all);
      ctx.cleanup(ctx.settings.onChange((key) => { if (key === 'homeIcon') all(); }));
      ctx.cleanup(() => {
        document.querySelectorAll(HOME_SEL).forEach((btn) => {
          const img = btn.querySelector(':scope > .ym-home-icon');
          if (img) img.remove();
          btn.removeAttribute('data-ym-home');
        });
      });
    },
  });
})();
