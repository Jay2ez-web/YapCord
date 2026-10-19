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
    description: 'Change the font of all of Yapper (system, rounded, serif, monospace, easy-to-read, or any font installed on your computer).',
    authors: ['YapCord'],
    tags: ['Appearance', 'Customisation'],
    api: { STACKS, clean },
    options: {
      preset: {
        type: 'select', default: 'rounded', description: 'Font',
        options: [{ label: 'Yapper\'s own', value: 'default' }, { label: 'System', value: 'system' }, { label: 'Rounded', value: 'rounded' }, { label: 'Serif', value: 'serif' }, { label: 'Monospace', value: 'mono' }, { label: 'Easy to read', value: 'readable' }, { label: 'My own (below)', value: 'custom' }],
      },
      custom: { type: 'string', default: '', description: 'Name of a font installed on your computer, for "My own"' },
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
