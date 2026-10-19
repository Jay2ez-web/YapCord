// SmoothTransitions: gentle motion for Yapper. Menus and dialogs ease in, hovers fade, a new message slides in,
// and switching chats fades the chat. Each part can be switched off; nothing moves if your system asks for less motion.
(function () {
  YM.definePlugin({
    name: 'SmoothTransitions',
    description: 'Smoother motion: menus and dialogs ease in, hover colours fade, new messages slide in and switching chats fades. Respects "reduce motion".',
    authors: ['YapCord'],
    tags: ['Appearance', 'Accessibility', 'Customisation'],
    options: {
      speed: { type: 'slider', default: 180, min: 80, max: 400, step: 20, description: 'Speed in milliseconds (lower is faster)' },
      menus: { type: 'boolean', default: true, description: 'Menus, dialogs and pickers ease in' },
      hover: { type: 'boolean', default: true, description: 'Hover and selection colours fade' },
      messages: { type: 'boolean', default: true, description: 'A new message slides in' },
      chats: { type: 'boolean', default: true, description: 'Switching chats fades the chat' },
    },
    start(ctx) {
      const s = () => ctx.settings.store;
      const dur = () => Math.max(80, Math.min(400, Number(s().speed) || 180));
      const css = () => {
        const d = dur();
        let out = '@media (prefers-reduced-motion:no-preference){:root{--ym-t:' + d + 'ms}@keyframes ymStIn{from{opacity:0;transform:translateY(8px)}}@keyframes ymStPop{from{opacity:0;transform:translateY(6px) scale(.97)}}@keyframes ymStFade{from{opacity:.25}}';
        if (s().menus) out += '.ctx-menu,.emoji-picker,.profile-card,.mention-menu,.modal,.server-menu{animation:ymStPop var(--ym-t) cubic-bezier(.2,.8,.2,1)}';
        if (s().hover) out += '.channel-row,.chat-row,.rail-item,.people-row,.icon-btn,.btn,.msg-actions button,.ctx-menu button{transition:background-color var(--ym-t),color var(--ym-t),border-radius var(--ym-t),transform var(--ym-t)}';
        if (s().messages) out += '.msg.ym-st-in{animation:ymStIn var(--ym-t) ease-out}';
        if (s().chats) out += '.main.ym-st-switch,main.ym-st-switch{animation:ymStFade calc(var(--ym-t) * 1.4) ease-out}';
        out += '}';
        ctx.css(out);
      };
      css();
      ctx.cleanup(ctx.settings.onChange(css));

      // A message that appears on its own (one or two at a time) slides in; a whole chat that loads at once does not.
      let batch = [];
      let raf = 0;
      ctx.watch(YM.messages.selector, (el) => {
        if (!s().messages) return;
        batch.push(el);
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const list = batch; batch = [];
          if (list.length > 2) return;
          for (const e of list) {
            if (!e.isConnected) continue;
            e.classList.add('ym-st-in');
            setTimeout(() => e.classList.remove('ym-st-in'), dur() + 80);
          }
        });
      });
      ctx.on('store:change', (st, prev) => {
        if (!s().chats || st.activeChannelId === prev.activeChannelId) return;
        const main = document.querySelector('main.main, .main');
        if (!main) return;
        main.classList.remove('ym-st-switch');
        void main.offsetWidth;
        main.classList.add('ym-st-switch');
        setTimeout(() => main.classList.remove('ym-st-switch'), dur() * 1.4 + 80);
      });
      ctx.cleanup(() => { if (raf) cancelAnimationFrame(raf); document.querySelectorAll('.ym-st-in,.ym-st-switch').forEach((n) => n.classList.remove('ym-st-in', 'ym-st-switch')); });
    },
  });
})();
