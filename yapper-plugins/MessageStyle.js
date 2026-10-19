// MessageStyle: a different look for the messages in a chat. Pure CSS.
(function () {
  const STYLES = {
    cards: '.msg{margin:8px 10px 0;padding:8px 14px;border-radius:var(--radius,10px);background:var(--bg-elev)}',
    bubbles: '.msg{margin:8px 12px 0;padding:8px 14px 8px 12px;border-radius:18px 18px 18px 6px;background:var(--bg-elev);width:fit-content;max-width:min(78%,640px)}',
    lines: '.msg{margin-top:0;padding-top:10px;padding-bottom:10px;border-bottom:1px solid var(--border)}',
    hover: '.msg{border-radius:8px;transition:background .12s}.msg:hover{background:color-mix(in srgb,var(--accent) 7%,transparent)}',
  };
  YM.definePlugin({
    name: 'MessageStyle',
    description: 'Give messages a different look: cards, chat bubbles, divider lines, or just a soft highlight when you point at one.',
    authors: ['YapCord'],
    tags: ['Appearance', 'Chat', 'Customisation'],
    api: { STYLES },
    options: {
      style: {
        type: 'select', default: 'cards', description: 'Style',
        options: [{ label: 'Cards', value: 'cards' }, { label: 'Chat bubbles', value: 'bubbles' }, { label: 'Divider lines', value: 'lines' }, { label: 'Hover highlight', value: 'hover' }],
      },
    },
    start(ctx) {
      const apply = () => ctx.css(STYLES[ctx.settings.store.style] || STYLES.cards, 'style');
      apply();
      ctx.cleanup(ctx.settings.onChange(apply));
    },
  });
})();
