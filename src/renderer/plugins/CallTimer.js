// CallTimer (port): shows how long you have been in the current voice channel or call, next to "Voice Connected".
// Yapper keeps the voice state in its store as `voice = { channelId, serverId, status: 'connecting' | 'connected', ... }`.
// The timer starts when the status turns "connected" and stops when you leave. If you switch the plugin on while already in
// a call, it counts from that moment.
(function () {
  const pad = (n) => String(n).padStart(2, '0');

  /** 75 -> "01:15", 3725 -> "1:02:05" (stopwatch) or "1h 2m 5s" (human). */
  function format(ms, style) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (style === 'human') return h ? `${h}h ${m}m ${s}s` : m ? `${m}m ${s}s` : `${s}s`;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  YM.definePlugin({
    name: 'CallTimer',
    description: 'Shows how long you have been in the current voice channel or call.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Voice', 'Utility'],
    api: { format },
    options: {
      format: {
        type: 'select', default: 'stopwatch', description: 'Time format',
        options: [{ label: 'Stopwatch (01:15, 1:02:05)', value: 'stopwatch' }, { label: 'Words (1m 15s, 1h 2m 5s)', value: 'human' }],
      },
    },
    start(ctx) {
      const h = YM.dom.h;
      let key = null; // channel we are timing
      let startedAt = null;

      function track(voice) {
        const k = voice && voice.status === 'connected' ? String(voice.channelId) : null;
        if (k === key) return;
        key = k;
        startedAt = k ? Date.now() : null;
      }

      function render() {
        document.querySelectorAll('.voice-bar .voice-status').forEach((status) => {
          const el = status.querySelector(':scope > .ym-calltimer');
          if (startedAt == null) {
            if (el) el.remove();
            return;
          }
          const text = format(Date.now() - startedAt, ctx.settings.store.format);
          if (el) {
            if (el.textContent !== text) el.textContent = text;
          } else {
            status.append(h('span', { class: 'ym-calltimer', title: 'Time in this call' }, text));
          }
        });
      }

      if (YM.Store.isReady) track(YM.Store.getState().voice);
      ctx.on('store:ready', () => { track(YM.Store.getState().voice); render(); });
      ctx.on('store:change', (next, prev) => {
        if (next.voice !== prev.voice) { track(next.voice); render(); }
      });
      ctx.interval(render, 1000);
      ctx.onMutate(render); // React may rebuild the bar
      ctx.cleanup(ctx.settings.onChange(render));
      ctx.cleanup(() => document.querySelectorAll('.ym-calltimer').forEach((n) => n.remove()));
      ctx.css('.ym-calltimer{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:600;font-size:12px;color:var(--text-muted)}');
      render();
    },
  });
})();
