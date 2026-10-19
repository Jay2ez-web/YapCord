// First-run setup shown once for a new YapCord profile. All choices are local and optional.
(() => {
  const h = YM.dom.h;
  let activeModal = null;
  const completedPath = 'onboarding.completed';

  function markDone() {
    YM.settings.set(completedPath, true);
  }

  function open(initialStep = 0) {
    if (activeModal) activeModal.close();
    let step = Math.max(0, Math.min(3, Number(initialStep) || 0));

    const render = () => {
      if (activeModal) activeModal.close();
      const themes = (YM.themes && YM.themes.available) || [];
      const currentThemes = YM.settings.get('enabledThemes', []) || [];
      const selected = h('select', { class: 'ym-input', 'aria-label': 'Choose an appearance theme' },
        h('option', { value: '' }, 'Keep the current appearance'),
        themes.map((t) => h('option', { value: t.fileName, selected: currentThemes.includes(t.fileName) }, t.name || t.fileName)));
      let body;
      let buttons;

      if (step === 0) {
        body = h('div', {},
          h('p', {}, 'Welcome to YapCord. This quick setup helps you choose an appearance, review notification permission, and learn the keyboard shortcuts.'),
          h('p', { class: 'ym-hint' }, 'Your YapCord preferences are stored locally. This setup does not change your Yapper account or send these choices anywhere.'));
        buttons = [{ label: 'Get started', onClick: () => { step = 1; render(); } }];
      } else if (step === 1) {
        body = h('div', {},
          h('p', {}, 'Choose an optional installed theme. You can change this later under YapCord settings → Themes.'),
          selected);
        buttons = [{ label: 'Back', onClick: () => { step = 0; render(); } }, { label: 'Continue', onClick: () => {
          const chosen = selected.value;
          const enabled = new Set(YM.settings.get('enabledThemes', []) || []);
          if (chosen) enabled.add(chosen);
          YM.settings.set('enabledThemes', [...enabled]);
          if (chosen && YM.themes && YM.themes.setEnabled) YM.themes.setEnabled(chosen, true);
          step = 2; render();
        } }];
      } else if (step === 2) {
        const status = h('p', { class: 'ym-hint' }, typeof Notification === 'undefined' ? 'This environment does not expose browser notifications.' : `Current permission: ${Notification.permission}.`);
        const ask = h('button', { type: 'button', class: 'ym-btn ym-btn-ghost', onClick: async () => {
          if (typeof Notification === 'undefined' || !Notification.requestPermission) return;
          try { const result = await Notification.requestPermission(); status.textContent = `Current permission: ${result}.`; }
          catch (_) { status.textContent = 'The permission request was unavailable. You can change this in system or site settings.'; }
        } }, 'Allow notifications');
        body = h('div', {},
          h('p', {}, 'Yapper notifications are optional. YapCord will not request permission unless you press the button below.'),
          status, ask);
        buttons = [{ label: 'Back', onClick: () => { step = 1; render(); } }, { label: 'Continue', onClick: () => { step = 3; render(); } }];
      } else {
        body = h('div', {},
          h('p', {}, 'Useful shortcuts:'),
          h('ul', {},
            h('li', {}, 'Ctrl/Cmd + K — open the quick switcher (when enabled).'),
            h('li', {}, 'Ctrl/Cmd + , — open YapCord settings.'),
            h('li', {}, 'Ctrl/Cmd + Shift + N — open a new YapCord window.'),
          ),
          h('p', { class: 'ym-hint' }, 'Shortcuts use Ctrl on Windows/Linux and Command on macOS. You can manage add-ons under Settings → Plugins.'));
        buttons = [
          { label: 'Back', onClick: () => { step = 2; render(); } },
          { label: 'Finish setup', onClick: (close) => { markDone(); activeModal = null; close(); } },
        ];
      }

      buttons.unshift({ label: 'Skip setup', onClick: (close) => { markDone(); activeModal = null; close(); } });
      activeModal = YM.modal.open({
        title: step === 0 ? 'Welcome to YapCord' : `First-run setup · ${step}/3`,
        subtitle: ['A few optional preferences', 'Appearance', 'Notifications', 'Keyboard shortcuts'][step],
        body,
        buttons,
      });
    };
    render();
    return activeModal;
  }

  YM.onboarding = { open };
  YM.Events.on('boot:ready', () => {
    if (YM.settings.get(completedPath, false)) return;
    setTimeout(() => {
      if (!YM.settings.get(completedPath, false) && document.body) open(0);
    }, 700);
  });
})();
