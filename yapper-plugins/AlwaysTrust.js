// AlwaysTrust: auto-click trust / confirm dialogs.
//
// DANGER ZONE: auto-confirming payments, message deletion, or password changes can cost money
// or destroy data with one misclick. So every destructive category is OFF by default and must be
// explicitly enabled in the plugin settings. Nothing here bypasses the server: it only clicks the
// same on-screen buttons you could click yourself, after a short visible delay.

(function () {
  const GENERIC = /^(trust|confirm|allow|continue|got it|i understand|yes|okay|ok)\s*/i;
  const DESTRUCTIVE = {
    payment: /pay|payment|checkout|buy|purchase|subscribe|billing/i,
    deletion: /delete|remove.*(message|channel|server|account)|destroy/i,
    password: /password|change.*(email|2fa|mfa)|reset.*(password|credentials)/i,
  };

  function buttonLabel(btn) {
    return ((btn.innerText || btn.textContent || btn.value || btn.getAttribute('aria-label') || '') + '').trim().replace(/\s+/g, ' ');
  }

  function dialogText(btn, depth) {
    let el = btn;
    for (let i = 0; i < (depth || 4) && el; i++) {
      el = el.parentElement;
      if (!el) break;
      if (/dialog|modal|popover|overlay|confirm|trust/i.test(el.className || el.id || (el.getAttribute ? el.getAttribute('role') : '') || '')) {
        return (el.innerText || '').slice(0, 600);
      }
    }
    // Fallback: nearest section text.
    const host = btn.closest('[role=dialog], .modal, .dialog, .confirm, form');
    return ((host && host.innerText) || '').slice(0, 600);
  }

  function isVisible(el) {
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    } catch (_) {
      return true;
    }
  }

  YM.definePlugin({
    name: 'AlwaysTrust',
    description: 'Auto-click trust/confirm dialogs. Destructive categories (payments, deletion, password changes) stay OFF unless you enable them.',
    authors: ['YapCord'],
    tags: ['Utility'],
    options: {
      trustDialogs: { type: 'boolean', default: true, description: 'Auto-click "Trust this device / computer" style prompts' },
      genericConfirms: { type: 'boolean', default: false, description: 'Auto-click generic Confirm / Continue / OK dialogs (can be spammy)' },
      skipPayments: { type: 'boolean', default: false, description: 'DANGEROUS: also auto-confirm dialogs mentioning payments/purchases' },
      skipDeletion: { type: 'boolean', default: false, description: 'DANGEROUS: also auto-confirm dialogs mentioning deletion' },
      skipPasswordChanges: { type: 'boolean', default: false, description: 'DANGEROUS: also auto-confirm dialogs mentioning passwords/credentials' },
      delayMs: { type: 'number', default: 800, min: 0, max: 5000, step: 50, description: 'Wait before clicking so you can see what happened (ms)' },
      extraAllow: { type: 'string', default: '', description: 'Extra dialog texts to auto-click (one match per line, case-insensitive)' },
    },
    start(ctx) {
      const clicked = new WeakSet();
      let timer = null;

      function allowedFor(context) {
        const st = ctx.settings.store;
        const text = context;
        const destructive =
          (st.skipPayments && DESTRUCTIVE.payment.test(text)) ||
          (st.skipDeletion && DESTRUCTIVE.deletion.test(text)) ||
          (st.skipPasswordChanges && DESTRUCTIVE.password.test(text));
        if (destructive) return true;
        // Block destructive dialogs unless their category is enabled.
        if (DESTRUCTIVE.payment.test(text) || DESTRUCTIVE.deletion.test(text) || DESTRUCTIVE.password.test(text)) return false;
        if (/trust.*(device|computer|browser)/i.test(text)) return !!st.trustDialogs;
        const extra = String(st.extraAllow || '').split('\n').map((s) => s.trim()).filter(Boolean);
        if (extra.some((re) => { try { return new RegExp(re, 'i').test(text); } catch (_) { return text.toLowerCase().includes(re.toLowerCase()); } })) return true;
        return !!st.genericConfirms && GENERIC.test(text.split('\n')[0] || '');
      }

      function scan() {
        let store;
        try { store = ctx.settings.store; } catch (_) { return; }
        if (!store.trustDialogs && !store.genericConfirms && !store.skipPayments && !store.skipDeletion && !store.skipPasswordChanges) return;
        const btns = document.querySelectorAll('button, [role=button], input[type=submit], input[type=button]');
        for (const btn of btns) {
          if (clicked.has(btn) || btn.disabled) continue;
          if (!isVisible(btn)) continue;
          const label = buttonLabel(btn);
          if (!GENERIC.test(label) && !/trust/i.test(label)) continue;
          const context = label + '\n' + dialogText(btn, 5);
          if (!allowedFor(context)) continue;
          clicked.add(btn);
          const delay = Math.max(0, Number(store.delayMs) || 0);
          setTimeout(() => {
            try {
              if (!btn.isConnected || btn.disabled) return;
              ctx.log.info('auto-clicking dialog button: ' + label.slice(0, 60));
              YM.toast('AlwaysTrust clicked: ' + label.slice(0, 60), { type: 'info' });
              btn.click();
            } catch (err) {
              ctx.log.warn('auto-click failed', err);
            }
          }, delay);
        }
      }

      timer = setInterval(scan, 700);
      const offMut = YM.dom.onMutate(() => scan());
      // Scan right away for dialogs already open.
      scan();

      ctx.cleanup(() => {
        clearInterval(timer);
        try { offMut && offMut(); } catch (_) {}
      });
    },
  });
})();
