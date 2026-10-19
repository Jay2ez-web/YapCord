// ScheduleMessages: clock button by the composer, date/time picker, 10s send loop, panel with cancel/edit.
//
// Scheduled messages persist in localStorage so they survive reloads. The loop runs every 10s and
// sends whatever is due. Sending uses Yapper's own live action when available, otherwise it fills
// the composer and presses Enter (only works while that channel is open).

(function () {
  const LS_KEY = 'yapcord:scheduled-messages:v1';

  function load() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }
  function save(list) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch (_) { /* storage full / blocked */ }
  }
  function uid() {
    return 'sched_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function fmtTime(ts) {
    try {
      return new Date(ts).toLocaleString();
    } catch (_) {
      return String(ts);
    }
  }

  async function sendNow(channelId, content) {
    // 1) Preferred: Yapper's own action module.
    try {
      const live = YM.Store.live && YM.Store.live();
      if (live && typeof live.sendMessage === 'function') {
        await live.sendMessage(channelId, content);
        return true;
      }
    } catch (err) {
      YM.log.warn('ScheduleMessages: live.sendMessage failed', err);
    }
    // 2) Finder fallback (same module, found lazily).
    try {
      const mod = YM.finder.findExports(['sendMessage']);
      if (mod && typeof mod.sendMessage === 'function') {
        await mod.sendMessage(channelId, content);
        return true;
      }
    } catch (_) { /* ignore */ }
    // 3) Last resort: type into the open composer and submit (active channel only).
    try {
      if (YM.Store.activeChannelId() !== channelId) return false;
      const ta = document.querySelector('.composer textarea');
      if (!ta) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, content);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      return true;
    } catch (_) {
      return false;
    }
  }

  YM.definePlugin({
    name: 'ScheduleMessages',
    description: 'Schedule messages for later: clock button by the input, date/time picker, 10s send loop, panel with cancel/edit.',
    authors: ['YapCord'],
    tags: ['Chat', 'Utility'],
    enabledByDefault: false,
    options: {
      loopSeconds: { type: 'number', default: 10, min: 5, max: 120, step: 1, description: 'How often to check for due messages (seconds)' },
      showPanel: { type: 'boolean', default: true, description: 'Show the scheduled-messages panel above the composer' },
    },
    start(ctx) {
      const h = YM.dom.h;
      let items = load();
      let panelEl = null;
      let popEl = null;

      const persist = () => save(items);
      const dueSoon = () => [...items].sort((a, b) => a.sendAt - b.sendAt);

      function renderPanel() {
        if (!panelEl || !panelEl.isConnected) return;
        panelEl.innerHTML = '';
        const st = ctx.settings.store;
        if (!st.showPanel) { panelEl.hidden = true; return; }
        const active = (() => { try { return YM.Store.activeChannelId(); } catch (_) { return null; } })();
        const mine = items.filter((m) => !active || m.channelId === active);
        if (!mine.length) { panelEl.hidden = true; return; }
        panelEl.hidden = false;
        panelEl.append(h('div', { class: 'ym-sched-title' }, 'Scheduled (' + mine.length + ')'));
        mine.slice(0, 5).forEach((m) => {
          const row = h('div', { class: 'ym-sched-row' },
            h('span', { class: 'ym-sched-when' }, fmtTime(m.sendAt)),
            h('span', { class: 'ym-sched-text' }, (m.content || '').slice(0, 60)),
            h('button', { class: 'ym-link', type: 'button', title: 'Edit', onClick: (e) => { e.stopPropagation(); openEditor(m); } }, 'edit'),
            h('button', { class: 'ym-link ym-danger', type: 'button', title: 'Cancel', onClick: (e) => { e.stopPropagation(); cancelItem(m.id); } }, 'cancel'),
          );
          panelEl.append(row);
        });
        if (mine.length > 5) panelEl.append(h('div', { class: 'ym-hint' }, '+' + (mine.length - 5) + ' more — open the clock menu for the full list'));
      }

      function cancelItem(id) {
        items = items.filter((m) => m.id !== id);
        persist();
        renderPanel();
        renderPopList();
        YM.toast('Scheduled message cancelled', { type: 'success' });
      }

      function openEditor(existing) {
        closePop();
        const channelId = (existing && existing.channelId) || (() => { try { return YM.Store.activeChannelId(); } catch (_) { return null; } })();
        if (!channelId) {
          YM.toast('Open a channel first to schedule a message', { type: 'error' });
          return;
        }
        const now = new Date(Date.now() + 60 * 60 * 1000);
        const pad = (n) => String(n).padStart(2, '0');
        const defaultVal = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
        const ta = document.querySelector('.composer textarea');
        const preset = (existing && existing.content) || (ta && ta.value) || '';

        popEl = h('div', { class: 'ym-sched-pop', role: 'dialog', 'aria-label': 'Schedule message' },
          h('div', { class: 'ym-sched-pop-title' }, existing ? 'Edit scheduled message' : 'Schedule message'),
          h('textarea', { class: 'ym-sched-input', rows: '3', placeholder: 'Message text…' }, preset),
          h('label', { class: 'ym-sched-label' }, 'Send at',
            h('input', { class: 'ym-sched-when-input', type: 'datetime-local', value: existing ? toLocalInput(existing.sendAt) : defaultVal })),
          h('div', { class: 'ym-sched-actions' },
            h('button', { class: 'ym-btn', type: 'button', onClick: closePop }, 'Close'),
            h('button', {
              class: 'ym-btn ym-btn-primary', type: 'button', onClick: () => {
                const text = popEl.querySelector('.ym-sched-input').value.trim();
                const whenRaw = popEl.querySelector('.ym-sched-when-input').value;
                const when = new Date(whenRaw).getTime();
                if (!text) { YM.toast('Write the message first', { type: 'error' }); return; }
                if (!Number.isFinite(when) || when <= Date.now() - 5000) { YM.toast('Pick a future date/time', { type: 'error' }); return; }
                if (existing) {
                  existing.content = text;
                  existing.sendAt = when;
                } else {
                  items.push({ id: uid(), channelId, content: text, sendAt: when, createdAt: Date.now() });
                }
                persist();
                renderPanel();
                closePop();
                YM.toast('Message scheduled for ' + fmtTime(when), { type: 'success' });
              },
            }, existing ? 'Save' : 'Schedule'),
          ),
          h('div', { class: 'ym-sched-list' }),
        );
        document.body.append(popEl);
        renderPopList();
        const input = popEl.querySelector('.ym-sched-input');
        if (input) input.focus();
        const onKey = (e) => { if (e.key === 'Escape') closePop(); };
        document.addEventListener('keydown', onKey, true);
        ctx.cleanup(() => document.removeEventListener('keydown', onKey, true));
        // Keep the one-shot listener alive only while the popover exists.
        const origClose = closePop;
        closePop = () => { document.removeEventListener('keydown', onKey, true); origClose(); };
      }

      let closePop = () => {
        if (popEl) popEl.remove();
        popEl = null;
      };

      function renderPopList() {
        if (!popEl) return;
        const host = popEl.querySelector('.ym-sched-list');
        if (!host) return;
        host.innerHTML = '';
        if (!items.length) {
          host.append(h('div', { class: 'ym-hint' }, 'Nothing scheduled.'));
          return;
        }
        host.append(h('div', { class: 'ym-sched-title' }, 'All scheduled (' + items.length + ')'));
        dueSoon().slice(0, 20).forEach((m) => {
          host.append(h('div', { class: 'ym-sched-row' },
            h('span', { class: 'ym-sched-when' }, fmtTime(m.sendAt)),
            h('span', { class: 'ym-sched-text' }, (m.content || '').slice(0, 50)),
            h('button', { class: 'ym-link', type: 'button', onClick: () => openEditor(m) }, 'edit'),
            h('button', { class: 'ym-link ym-danger', type: 'button', onClick: () => cancelItem(m.id) }, 'cancel'),
          ));
        });
      }

      function toLocalInput(ts) {
        const d = new Date(ts);
        const pad = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      }

      // Clock button next to the composer.
      function ensureButton() {
        const composer = document.querySelector('.composer');
        if (!composer || composer.querySelector('.ym-sched-btn')) return;
        const sendBtn = composer.querySelector('button[type=submit], .send-btn, [class*=send i]');
        const btn = h('button', {
          class: 'ym-sched-btn icon-btn',
          type: 'button',
          title: 'Schedule message',
          'aria-label': 'Schedule message',
          html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
          onClick: (e) => { e.stopPropagation(); e.preventDefault(); openEditor(null); },
        });
        if (sendBtn && sendBtn.parentNode) sendBtn.parentNode.insertBefore(btn, sendBtn);
        else composer.append(btn);
        if (!composer.querySelector('.ym-sched-panel')) {
          panelEl = h('div', { class: 'ym-sched-panel', hidden: true });
          composer.prepend(panelEl);
          renderPanel();
        }
      }

      const offWatch = YM.dom.watch('.composer', ensureButton);
      ensureButton();

      // 10s send loop.
      let sending = false;
      async function tick() {
        if (sending) return;
        sending = true;
        try {
          const now = Date.now();
          const due = items.filter((m) => m.sendAt <= now);
          for (const m of due) {
            const ok = await sendNow(m.channelId, m.content);
            if (ok) {
              items = items.filter((x) => x.id !== m.id);
              persist();
              YM.toast('Scheduled message sent', { type: 'success' });
            } else {
              // Channel not open / send failed: retry next tick, but don't spam forever.
              m.retries = (m.retries || 0) + 1;
              if (m.retries > 60) {
                items = items.filter((x) => x.id !== m.id);
                YM.toast('Scheduled message failed (channel not open)', { type: 'error' });
              } else {
                m.sendAt = Date.now() + 30000; // retry in 30s
              }
              persist();
            }
            renderPanel();
            renderPopList();
          }
          renderPanel();
        } finally {
          sending = false;
        }
      }

      const loopMs = () => Math.max(5, Number(ctx.settings.store.loopSeconds) || 10) * 1000;
      let timer = setInterval(tick, loopMs());
      tick(); // send anything already overdue immediately instead of waiting a full loop
      const offSettings = ctx.settings.onChange(() => {
        clearInterval(timer);
        timer = setInterval(tick, loopMs());
        renderPanel();
      });
      // Re-render when switching channels.
      const offStore = YM.Events.on('store:change', (next, prev) => {
        if (next.activeChannelId !== prev.activeChannelId) renderPanel();
      });

      ctx.cleanup(() => {
        clearInterval(timer);
        try { offWatch && offWatch(); } catch (_) {}
        try { offSettings && offSettings(); } catch (_) {}
        try { offStore && offStore(); } catch (_) {}
        closePop();
        document.querySelectorAll('.ym-sched-btn,.ym-sched-panel,.ym-sched-pop').forEach((n) => n.remove());
        panelEl = null;
      });

      ctx.css(`
.ym-sched-btn { opacity: .85; }
.ym-sched-btn:hover { opacity: 1; }
.ym-sched-panel { margin: 4px 8px; padding: 6px 10px; border: 1px solid rgba(255,255,255,.1); border-radius: 8px; background: var(--bg-2, rgba(0,0,0,.25)); font-size: 12px; }
.ym-sched-title { font-weight: 700; margin-bottom: 4px; }
.ym-sched-row { display: flex; gap: 8px; align-items: center; padding: 2px 0; }
.ym-sched-when { color: var(--text-muted); white-space: nowrap; }
.ym-sched-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ym-sched-pop { position: fixed; right: 16px; bottom: 90px; z-index: 2147483000; width: 340px; max-height: 70vh; overflow: auto; padding: 12px; border-radius: 12px; background: var(--bg-3, #2a2c33); color: var(--text, #fff); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 12px 40px rgba(0,0,0,.5); display: flex; flex-direction: column; gap: 8px; }
.ym-sched-pop-title { font-weight: 700; }
.ym-sched-input, .ym-sched-when-input { width: 100%; box-sizing: border-box; border-radius: 8px; border: 1px solid rgba(255,255,255,.15); background: rgba(0,0,0,.3); color: inherit; padding: 8px; font: inherit; }
.ym-sched-label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-muted); }
.ym-sched-actions { display: flex; gap: 8px; justify-content: flex-end; }
.ym-link.ym-danger { color: var(--danger, #e5484d); }
`);
      // First render once the store is ready (activeChannelId may be null at boot).
      YM.Store.ready.then(() => renderPanel()).catch(() => undefined);
    },
  });
})();
