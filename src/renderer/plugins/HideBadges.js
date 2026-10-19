// HideBadges: take the badges away from beside the names in chat, and give the badges on profile cards a tidier look.
// Only on your screen. The badges are still on the profile card (and the tidy-up makes them easier to read there).
(function () {
  const RULES = {
    badges: '.msg-head .ubadge',
    verified: '.msg-head .verified-badge',
    plus: '.msg-head .plus-badge',
    tags: '.msg-head .stag',
  };
  const TIDY = [
    '.pc2-badges{gap:6px;margin:6px 0 8px}',
    '.pc2-badges .ubadge.lg{margin:0;padding:5px 11px;border-radius:999px;font-weight:600;box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 2px 8px rgba(0,0,0,.18);transition:transform .15s ease,background .15s ease}',
    '.pc2-badges .ubadge.lg:hover{transform:translateY(-1px);background:var(--bg-hover,rgba(255,255,255,.08))}',
    '@media (prefers-reduced-motion:reduce){.pc2-badges .ubadge.lg{transition:none}.pc2-badges .ubadge.lg:hover{transform:none}}',
  ].join('');

  /** The stylesheet for the chosen options. */
  function cssFor(s) {
    const hide = Object.keys(RULES).filter((k) => s[k]).map((k) => RULES[k]);
    return (hide.length ? hide.join(',') + '{display:none!important}' : '') + (s.tidy ? TIDY : '');
  }

  YM.definePlugin({
    name: 'HideBadges',
    description: 'Hide the badges next to names in chat (and optionally the verified, Plus and server-tag labels), and tidy up the badge row on profile cards.',
    authors: ['YapCord'],
    tags: ['Appearance', 'Chat', 'Customisation'],
    api: { cssFor, RULES },
    options: {
      badges: { type: 'boolean', default: true, description: 'Hide the profile badges next to names in chat' },
      verified: { type: 'boolean', default: false, description: 'Also hide the verified tick next to names' },
      plus: { type: 'boolean', default: false, description: 'Also hide the Plus label next to names' },
      tags: { type: 'boolean', default: false, description: 'Also hide server tags next to names' },
      tidy: { type: 'boolean', default: true, description: 'Tidier badge row on profile cards (round chips, a little lift on hover)' },
    },
    start(ctx) {
      const apply = () => ctx.css(cssFor(ctx.settings.store));
      apply();
      ctx.cleanup(ctx.settings.onChange(apply));
    },
  });
})();
