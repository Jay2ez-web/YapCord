// MoreQuickReactions (port): the right-click menu of a message shows more quick reactions than the usual four.
(function () {
  const DEFAULTS = ['😮', '😢', '🎉', '👀', '💯', '🙏'];

  function parseList(text) {
    const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    const parts = seg ? [...seg.segment(String(text || ''))].map((x) => x.segment) : Array.from(String(text || ''));
    return parts.filter((p) => /\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣/u.test(p)).slice(0, 12);
  }

  YM.definePlugin({
    name: 'MoreQuickReactions',
    description: 'Adds extra emojis to the quick reactions in the right-click menu of a message (Yapper shows 4).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat'],
    api: { parseList },
    options: {
      emojis: { type: 'string', default: DEFAULTS.join(' '), description: 'Extra emojis (up to 12), written one after the other' },
    },
    start(ctx) {
      const actions = YM.finder.lazy(['toggleReaction', 'sendMessage']);
      let lastMessageId = null;
      // The menu does not tell which message it belongs to: remember the row the right click was on.
      const onContext = (e) => {
        const row = e.target instanceof Element ? e.target.closest('.msg[data-message-id]') : null;
        lastMessageId = row ? row.getAttribute('data-message-id') : null;
      };
      document.addEventListener('contextmenu', onContext, true);
      ctx.cleanup(() => document.removeEventListener('contextmenu', onContext, true));

      const sync = () => {
        document.querySelectorAll('.ctx-menu .quick-reacts').forEach((bar) => {
          if (bar.querySelector('.ym-qr-extra')) return;
          const mod = actions();
          if (!mod || !lastMessageId) return;
          const id = lastMessageId;
          parseList(ctx.settings.store.emojis).forEach((emoji) => {
            if ([...bar.querySelectorAll('button')].some((b) => (b.getAttribute('aria-label') || '') === 'React ' + emoji)) return;
            bar.append(YM.dom.h('button', {
              type: 'button', class: 'ym-qr-extra', 'aria-label': 'React ' + emoji,
              onClick: () => {
                const overlay = bar.closest('.overlay');
                if (overlay) overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                Promise.resolve(mod.toggleReaction(id, emoji)).catch((err) => YM.toast('Could not react: ' + ((err && err.message) || err), { type: 'error' }));
              },
            }, emoji));
          });
        });
      };
      ctx.onMutate(sync);
      ctx.css('.quick-reacts{flex-wrap:wrap}.quick-reacts .ym-qr-extra{font-size:20px;line-height:1;min-width:34px;min-height:34px}');
    },
  });
})();
