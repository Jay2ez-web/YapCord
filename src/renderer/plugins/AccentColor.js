// AccentColor: pick your own accent colour for all of Yapper (buttons, highlights, switches, unread dots).
// Only changes the CSS colour variables on your screen.
(function () {
  const PRESETS = ['#ff6b4a', '#f43f5e', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#f59e0b'];
  const valid = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  /** Text colour that stays readable on top of the accent. */
  function onColor(hex) {
    const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#14151a' : '#ffffff';
  }
  function darker(hex, k) {
    return '#' + rgb(hex).map((v) => Math.max(0, Math.round(v * k)).toString(16).padStart(2, '0')).join('');
  }
  function cssFor(hex) {
    return ':root{--accent:' + hex + ';--accent-hover:' + darker(hex, 0.86) + ';--accent-soft:' + hex + '29;--on-accent:' + onColor(hex) + '}';
  }

  YM.definePlugin({
    name: 'AccentColor',
    description: 'Choose your own accent colour for buttons, highlights, switches and unread dots in all of Yapper.',
    authors: ['YapCord'],
    tags: ['Appearance', 'Customisation'],
    api: { valid, cssFor, onColor, PRESETS },
    options: {
      color: {
        type: 'custom',
        default: '#6366f1',
        render(box, plugin) {
          const h = YM.dom.h;
          box.style.flexDirection = 'column';
          box.style.alignItems = 'stretch';
          const input = h('input', { type: 'color', value: valid(plugin.settings.store.color) ? plugin.settings.store.color : '#6366f1', 'aria-label': 'Accent colour', style: { width: '56px', height: '36px', padding: 0, border: 0, background: 'none' }, onInput: (e) => plugin.settings.set('color', e.target.value) });
          const swatches = PRESETS.map((c) => h('button', { type: 'button', title: c, 'aria-label': 'Use ' + c, style: { width: '28px', height: '28px', borderRadius: '50%', background: c, border: '2px solid transparent', cursor: 'pointer' }, onClick: () => { input.value = c; plugin.settings.set('color', c); } }));
          box.append(h('div', { class: 'toggle-label' }, 'Accent colour'), h('div', { class: 'ym-toolbar' }, input, ...swatches));
        },
      },
    },
    start(ctx) {
      const apply = () => {
        const c = ctx.settings.store.color;
        ctx.css(cssFor(valid(c) ? c : '#6366f1'), 'accent');
      };
      apply();
      ctx.cleanup(ctx.settings.onChange((k) => { if (k === 'color') apply(); }));
    },
  });
})();
