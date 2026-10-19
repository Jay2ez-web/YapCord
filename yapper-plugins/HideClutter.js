// HideClutter: switch off parts of Yapper's screen you never use. Each one is a tick box.
(function () {
  const RULES = {
    gif: ['The GIF button in the message box', 'button.icon-btn[aria-label="GIF"]'],
    poll: ['The poll button in the message box', 'button.icon-btn[aria-label="Create a poll"]'],
    createServer: ['The + button that creates a server', '.rail-wrap:has(> button.rail-item.add[title="Create a server"])'],
    discover: ['The discover servers button', '.rail-wrap:has(> button.rail-item.add[title="Discover servers"])'],
    download: ['The "Download the desktop app" button', '.rail-wrap:has(> a.rail-item.add[href="/download"])'],
    charCount: ['The character counter', '.char-count'],
    emoji: ['The emoji button in the message box', 'button.icon-btn[data-emoji-toggle]'],
  };
  const options = {};
  for (const [k, [label]] of Object.entries(RULES)) options[k] = { type: 'boolean', default: k === 'download' || k === 'discover', description: label };

  YM.definePlugin({
    name: 'HideClutter',
    description: 'Hide buttons you never use: GIF, polls, create server, discover, download app, the character counter and more.',
    authors: ['YapCord'],
    tags: ['Appearance', 'Customisation'],
    api: { RULES },
    options,
    start(ctx) {
      const apply = () => {
        const s = ctx.settings.store;
        const sel = Object.entries(RULES).filter(([k]) => s[k]).map(([, [, q]]) => q);
        ctx.css(sel.length ? sel.join(',') + '{display:none!important}' : '', 'hide');
      };
      apply();
      ctx.cleanup(ctx.settings.onChange(apply));
    },
  });
})();
