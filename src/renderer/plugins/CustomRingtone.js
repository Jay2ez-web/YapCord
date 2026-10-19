// CustomRingtone: choose the sound you hear when someone calls you. Pick a built-in tune or your own audio file.
// Only you hear it; the caller does not know. Yapper's own ring is silenced while yours plays.
(function () {
  const KEY = 'pluginData.CustomRingtone';
  const MAX_BYTES = 1_500_000;
  const readFile = () => { const v = YM.settings.get(KEY, ''); return typeof v === 'string' && /^data:audio\/[a-z0-9.+-]+;base64,/i.test(v) ? v : ''; };

  // Each tune: [frequency Hz, start s, length s, volume] and the type of wave. Every tune is shorter than 2 seconds; it repeats while the phone rings.
  const TUNES = {
    classic: { type: 'sine', notes: [[880, 0, .25, .5], [660, .3, .25, .5], [880, .7, .25, .5], [660, 1, .25, .5]] },
    marimba: { type: 'triangle', notes: [[523, 0, .2, .6], [659, .15, .2, .6], [784, .3, .2, .6], [1047, .45, .35, .6], [784, .9, .2, .5], [659, 1.05, .35, .5]] },
    chime: { type: 'sine', notes: [[1319, 0, .8, .4], [988, .35, .9, .4], [1319, 1, .8, .3]] },
    alarm: { type: 'square', notes: [[740, 0, .14, .22], [0, .14, .06, 0], [740, .2, .14, .22], [0, .34, .06, 0], [740, .4, .14, .22]] },
    retro: { type: 'square', notes: [[392, 0, .1, .2], [523, .1, .1, .2], [659, .2, .1, .2], [784, .3, .1, .2], [1047, .4, .3, .2], [784, .8, .1, .2], [1047, .9, .3, .2]] },
  };

  YM.definePlugin({
    name: 'CustomRingtone',
    description: 'Choose the sound you hear when someone calls you: a built-in tune or your own audio file. Only you hear it.',
    authors: ['YapCord'],
    tags: ['Voice', 'Notifications', 'Customisation'],
    api: { TUNES, readFile, MAX_BYTES },
    options: {
      tune: {
        type: 'select', default: 'marimba', description: 'Sound',
        options: [{ label: 'Marimba', value: 'marimba' }, { label: 'Classic phone', value: 'classic' }, { label: 'Soft chime', value: 'chime' }, { label: 'Alarm', value: 'alarm' }, { label: 'Retro game', value: 'retro' }, { label: 'My own file (below)', value: 'file' }],
      },
      volume: { type: 'slider', default: 70, min: 5, max: 100, step: 5, description: 'Volume (%)' },
      file: {
        type: 'custom', default: false,
        render(box, plugin) {
          const h = YM.dom.h;
          box.style.flexDirection = 'column';
          box.style.alignItems = 'stretch';
          const state = h('div', { class: 'hint' });
          const paint = () => { state.textContent = readFile() ? 'Your file is saved.' : 'No file yet. MP3, OGG, WAV or M4A, up to 1.5 MB.'; clear.disabled = !readFile(); };
          const input = h('input', { type: 'file', accept: 'audio/*', hidden: true, onChange: async () => {
            const f = input.files && input.files[0]; input.value = '';
            if (!f) return;
            if (!/^audio\//.test(f.type || '')) { YM.toast('That is not an audio file.', { type: 'error' }); return; }
            if (f.size > MAX_BYTES) { YM.toast('That file is too large (over 1.5 MB). Pick a shorter one.', { type: 'error' }); return; }
            const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });
            YM.settings.set(KEY, url);
            plugin.settings.set('tune', 'file');
            YM.toast('Ringtone saved. Only you hear it.');
            paint();
          } });
          const clear = h('button', { type: 'button', class: 'ym-btn ym-btn-small ym-btn-ghost', onClick: () => { YM.settings.set(KEY, ''); if (plugin.settings.store.tune === 'file') plugin.settings.set('tune', 'marimba'); paint(); } }, 'Remove file');
          const test = h('button', { type: 'button', class: 'ym-btn ym-btn-small', onClick: () => { const p = YM.plugins.get('CustomRingtone'); if (p && p.api && p.api.preview) p.api.preview(); else YM.toast('Switch the plugin on to hear it.'); } }, 'Play');
          box.append(h('div', { class: 'toggle-label' }, 'Your own file'), state, h('div', { class: 'ym-toolbar' }, h('button', { type: 'button', class: 'ym-btn ym-btn-small', onClick: () => input.click() }, 'Choose file...'), clear, test), input);
          paint();
        },
      },
    },
    start(ctx) {
      let audioCtx = null;
      let timer = null;
      let fileAudio = null;
      const mine = new WeakSet();
      let ringSeen = false;

      const volume = () => Math.max(0.05, Math.min(1, (Number(ctx.settings.store.volume) || 70) / 100));
      const ac = () => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        return audioCtx;
      };
      function playTuneOnce(name) {
        const tune = TUNES[name] || TUNES.marimba;
        const a = ac();
        const t0 = a.currentTime + 0.02;
        const master = a.createGain();
        master.gain.value = volume();
        master.connect(a.destination);
        for (const [freq, at, len, vol] of tune.notes) {
          if (!freq) continue;
          const osc = a.createOscillator();
          const g = a.createGain();
          mine.add(osc);
          osc.type = tune.type;
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0, t0 + at);
          g.gain.linearRampToValueAtTime(vol, t0 + at + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + at + len);
          osc.connect(g);
          g.connect(master);
          osc.start(t0 + at);
          osc.stop(t0 + at + len + 0.05);
        }
      }
      function stop() {
        if (timer) { clearInterval(timer); timer = null; }
        if (fileAudio) { fileAudio.pause(); fileAudio = null; }
      }
      function start() {
        stop();
        const s = ctx.settings.store;
        if (s.tune === 'file' && readFile()) {
          fileAudio = new Audio(readFile());
          fileAudio.loop = true;
          fileAudio.volume = volume();
          fileAudio.play().catch((e) => YM.log.warn('ringtone file could not play', e));
        } else {
          const name = s.tune === 'file' ? 'marimba' : s.tune;
          playTuneOnce(name);
          timer = setInterval(() => playTuneOnce(name), 2000);
        }
      }
      function preview() {
        stop();
        start();
        setTimeout(() => { const st = YM.Store.getState(); if (!st || !st.ringing) stop(); }, 2200);
      }
      const self = YM.plugins.get('CustomRingtone');
      if (self && self.api) self.api.preview = preview;

      // Yapper's own ring is muted while someone is calling (its sound is repeated every 2 seconds).
      ctx.cleanup(YM.media.onSound(({ kind, node }) => {
        if (mine.has(node)) return undefined;
        const st = YM.Store.getState();
        if (!st || !st.ringing) return undefined;
        if (kind === 'buffer' && YM.media.soundOf(node) === 'ring') { ringSeen = true; return false; }
        if (kind === 'oscillator' && !ringSeen) return false; // its fallback beeps, when the ring file did not load
        return undefined;
      }));
      ctx.on('store:change', (st, prev) => {
        const was = !!(prev && prev.ringing);
        const now = !!st.ringing;
        if (now && !was) {
          if (st.sounds === false || st.myStatus === 'dnd') return; // respect Yapper's sound switch and Do not disturb
          start();
        } else if (!now && was) stop();
      });
      ctx.cleanup(() => { stop(); if (self && self.api) delete self.api.preview; if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; } });
    },
  });
})();
