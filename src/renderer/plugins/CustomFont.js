// CustomFont: change the font Yapper uses, and make all text a bit bigger or smaller.
(function () {
  const STACKS = {
    system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    rounded: 'ui-rounded, "Nunito", "Varela Round", "Segoe UI", system-ui, sans-serif',
    serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", Cambria, serif',
    mono: 'ui-monospace, "Cascadia Code", Consolas, "SFMono-Regular", Menlo, monospace',
    readable: 'Verdana, Tahoma, "Trebuchet MS", sans-serif',
  };
  const clean = (v) => String(v || '').replace(/[;{}<>\\]/g, '').trim().slice(0, 80);

  YM.definePlugin({
    name: 'CustomFont',
    description: 'Choose a font preset, use an installed system font, or import a font file directly without typing its family name.',
    authors: ['YapCord'],
    tags: ['Appearance', 'Customisation'],
    api: { STACKS, clean },
    options: {
      preset: {
        type: 'select', default: 'rounded', description: 'Font',
        options: [{ label: 'Yapper\'s own', value: 'default' }, { label: 'System', value: 'system' }, { label: 'Rounded', value: 'rounded' }, { label: 'Serif', value: 'serif' }, { label: 'Monospace', value: 'mono' }, { label: 'Easy to read', value: 'readable' }, { label: 'My own (below)', value: 'custom' }],
      },
      custom: { type: 'string', default: '', description: 'Optional installed system-font family name for "My own"; file imports do not need this.' },
      importFile: {
        type: 'custom',
        render(container) {
          const h = YM.dom.h;
          container.append(
            h('button', {
              class: 'ym-btn ym-btn-ghost ym-btn-small',
              type: 'button',
              onClick: () => {
                const filesPlugin = YM.plugins.get('CustomFontFiles');
                if (!filesPlugin) {
                  YM.toast('Font file import is unavailable in this YapCord build.', { type: 'error' });
                  return;
                }
                if (!YM.plugins.isEnabled('CustomFontFiles')) YM.plugins.setEnabled('CustomFontFiles', true);
                let attempts = 0;
                const openPicker = () => {
                  const api = YM.plugins.get('CustomFontFiles') && YM.plugins.get('CustomFontFiles').api;
                  if (api && typeof api.importFiles === 'function') {
                    api.importFiles().catch((err) => YM.toast('Could not import font file: ' + (err.message || err), { type: 'error' }));
                    return;
                  }
                  if (++attempts >= 10) {
                    YM.toast('The font importer could not start. Try enabling CustomFontFiles in Plugins.', { type: 'error' });
                    return;
                  }
                  setTimeout(openPicker, 25);
                };
                setTimeout(openPicker, 0);
              },
            }, 'Import font file…'),
            h('span', { class: 'ym-hint' }, 'The file name is used automatically; no family-name entry is needed.'),
          );
        },
      },
      size: { type: 'slider', default: 100, min: 80, max: 130, step: 5, description: 'Text size in percent' },
    },
    start(ctx) {
      const apply = () => {
        const s = ctx.settings.store;
        let stack = '';
        if (s.preset === 'custom') { const n = clean(s.custom); if (n) stack = '"' + n.replace(/"/g, '') + '", ' + STACKS.system; }
        else if (STACKS[s.preset]) stack = STACKS[s.preset];
        const size = Math.max(80, Math.min(130, Number(s.size) || 100));
        ctx.css((stack ? ':root{--font:' + stack + '}body,button,input,textarea,select{font-family:' + stack + '}' : '') + (size !== 100 ? 'html{font-size:' + size + '%}.msg-text,.chat-row,.channel-row{font-size:' + size + '%}' : ''), 'font');
      };
      apply();
      ctx.cleanup(ctx.settings.onChange(apply));
    },
  });
})();
