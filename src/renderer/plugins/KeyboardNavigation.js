// Experimental 1.2: keyboard navigation for channels, unread items, composer, and voice controls.
(function () {
  function rows() {
    return [...document.querySelectorAll('.sidebar .channel-row button.channel-main,.sidebar .channel-row')]
      .filter((el) => !el.closest('[hidden]') && el.offsetParent !== null);
  }
  function activate(row) {
    const target = row.matches('button') ? row : row.querySelector('button.channel-main,button');
    if (target) target.click();
  }
  function focusComposer() {
    const el = document.querySelector('textarea:not([disabled]),[contenteditable="true"]:not([aria-hidden="true"])');
    if (el) { el.focus(); return true; }
    return false;
  }
  function clickVoice(pattern) {
    const button = [...document.querySelectorAll('button,[role="button"]')]
      .find((el) => pattern.test(String(el.getAttribute('aria-label') || el.title || el.textContent || '')));
    if (!button) return false;
    button.click();
    return true;
  }

  YM.definePlugin({
    name: 'KeyboardNavigation',
    description: 'Experimental shortcuts: Alt+Up/Down channels, Alt+U unread, Alt+M composer, and Alt+Shift+M/D voice controls.',
    authors: ['YapCord 1.2 experimental'],
    tags: ['Navigation', 'Accessibility', 'Voice'],
    enabledByDefault: false,
    start(ctx) {
      let index = -1;
      const onKey = (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey === false) return;
        const key = event.key.toLowerCase();
        if (key === 'arrowdown' || key === 'arrowup') {
          const list = rows();
          if (!list.length) return;
          event.preventDefault();
          index = (index + (key === 'arrowdown' ? 1 : -1) + list.length) % list.length;
          list[index].scrollIntoView({ block: 'nearest' });
          activate(list[index]);
        } else if (key === 'u') {
          const unread = document.querySelector('.sidebar .channel-row.unread,[data-unread="true"]');
          if (unread) { event.preventDefault(); activate(unread); }
        } else if (key === 'm' && !event.shiftKey) {
          event.preventDefault();
          if (!focusComposer()) YM.toast('Message composer was not found.', { type: 'error' });
        } else if (key === 'm' && event.shiftKey) {
          event.preventDefault();
          if (!clickVoice(/\b(un)?mute\b/i)) YM.toast('Mute control was not found.', { type: 'error' });
        } else if (key === 'd' && event.shiftKey) {
          event.preventDefault();
          if (!clickVoice(/\b(un)?deafen\b/i)) YM.toast('Deafen control was not found.', { type: 'error' });
        }
      };
      document.addEventListener('keydown', onKey, true);
      ctx.cleanup(() => document.removeEventListener('keydown', onKey, true));
    },
  });
})();
