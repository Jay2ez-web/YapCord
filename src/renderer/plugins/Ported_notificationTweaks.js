// Notification Tweaks: play a short local sound when a new message appears.
(function () {
  const MAX_SOUND_BYTES = 1_500_000;
  const DATA_URL_RE = /^data:audio\/[a-z0-9.+-]+;base64,/i;
  const AUDIO_EXTENSIONS = new Set(['mp3', 'ogg', 'oga', 'wav', 'm4a', 'weba', 'webm', 'flac', 'aac', 'opus']);
  const isAudioFile = (file) => {
    if (!file || typeof file.name !== 'string') return false;
    const type = String(file.type || '').toLowerCase();
    if (type) return type.startsWith('audio/');
    const ext = file.name.split('.').pop().toLowerCase();
    return AUDIO_EXTENSIONS.has(ext);
  };
  const readDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Could not read the sound file.'));
    reader.readAsDataURL(file);
  });

  YM.definePlugin({
    name: 'Notification Tweaks',
    description: 'Import your own sound for new-message notifications, or keep the built-in tone.',
    authors: ['YapCord'],
    tags: ['Chat', 'Notifications'],
    enabledByDefault: false,
    api: { MAX_SOUND_BYTES, isAudioFile },
    options: {
      volume: { type: 'slider', default: 55, min: 5, max: 100, step: 5, description: 'Sound volume (%)' },
      customSoundData: { type: 'string', default: '', hidden: true },
      customSoundName: { type: 'string', default: '', hidden: true },
      importSound: {
        type: 'custom',
        default: false,
        render(box, plugin) {
          const h = YM.dom.h;
          box.style.flexDirection = 'column';
          box.style.alignItems = 'stretch';
          const status = h('div', { class: 'hint' });
          let previewAudio = null;
          const storedSound = () => {
            const value = plugin.settings.store.customSoundData;
            return typeof value === 'string' && DATA_URL_RE.test(value) ? value : '';
          };
          const paint = () => {
            const data = storedSound();
            const name = String(plugin.settings.store.customSoundName || 'sound file');
            status.textContent = data
              ? `Imported: ${name}. This sound will play for new messages.`
              : 'No custom sound imported. The built-in tone will play.';
            clear.disabled = !data;
            play.disabled = !data;
          };
          const input = h('input', {
            type: 'file',
            accept: 'audio/*',
            hidden: true,
            onChange: async () => {
              const file = input.files && input.files[0];
              input.value = '';
              if (!file) return;
              if (!isAudioFile(file)) {
                YM.toast('Choose an audio file (MP3, OGG, WAV, M4A, WebM, FLAC, AAC or Opus).', { type: 'error' });
                return;
              }
              if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_SOUND_BYTES) {
                YM.toast('That sound file must be smaller than 1.5 MB.', { type: 'error' });
                return;
              }
              try {
                const data = await readDataUrl(file);
                if (!DATA_URL_RE.test(data)) throw new Error('This audio format could not be imported.');
                plugin.settings.set('customSoundData', data);
                plugin.settings.set('customSoundName', file.name.slice(0, 180));
                YM.toast('Notification sound imported. It will be used for new messages.');
                paint();
              } catch (error) {
                YM.toast(error.message || 'Could not import that sound file.', { type: 'error' });
              }
            },
          });
          const clear = h('button', {
            type: 'button', class: 'ym-btn ym-btn-small ym-btn-ghost',
            onClick: () => {
              if (previewAudio) { previewAudio.pause(); previewAudio = null; }
              plugin.settings.set('customSoundData', '');
              plugin.settings.set('customSoundName', '');
              YM.toast('Custom notification sound removed. The built-in tone will play.');
              paint();
            },
          }, 'Remove sound');
          const play = h('button', {
            type: 'button', class: 'ym-btn ym-btn-small',
            onClick: async () => {
              const data = storedSound();
              if (!data) return;
              if (previewAudio) previewAudio.pause();
              previewAudio = new Audio(data);
              previewAudio.volume = Math.max(0.05, Math.min(1, (Number(plugin.settings.store.volume) || 55) / 100));
              try {
                await previewAudio.play();
              } catch (_) {
                YM.toast('Could not play this sound file. Try a different audio format.', { type: 'error' });
              }
            },
          }, 'Play test');
          const importButton = h('button', {
            type: 'button', class: 'ym-btn ym-btn-small',
            onClick: () => input.click(),
          }, 'Import sound');
          box.append(
            h('div', { class: 'toggle-label' }, 'Custom notification sound'),
            status,
            h('div', { class: 'ym-toolbar' }, importButton, play, clear),
            input,
          );
          paint();
        },
      },
    },
    start(ctx) {
      let audioContext = null;
      let customAudio = null;
      let customAudioSource = '';
      let lastPlayed = 0;
      const SELECTOR = 'div.msg[data-message-id]';
      const unlockAudio = () => {
        try {
          if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
          if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
        } catch (_) { /* ignore */ }
      };
      const getCustomAudio = () => {
        const stored = ctx.settings.store.customSoundData;
        const source = typeof stored === 'string' && DATA_URL_RE.test(stored) ? stored : '';
        if (source === customAudioSource) return customAudio;
        if (customAudio) {
          customAudio.pause();
          customAudio.removeAttribute('src');
          customAudio.load();
        }
        customAudioSource = source;
        customAudio = source ? new Audio(source) : null;
        if (customAudio) customAudio.preload = 'auto';
        return customAudio;
      };
      const playTone = (volume) => {
        if (!audioContext || audioContext.state === 'suspended') return;
        const now = audioContext.currentTime;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(660, now);
        oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0011, volume * 0.1), now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.18);
      };
      const playSound = () => {
        if (Date.now() - lastPlayed < 250) return;
        lastPlayed = Date.now();
        const volume = Math.max(0.05, Math.min(1, (Number(ctx.settings.store.volume) || 55) / 100));
        try {
          const audio = getCustomAudio();
          if (audio) {
            audio.volume = volume;
            audio.currentTime = 0;
            const result = audio.play();
            if (result && typeof result.catch === 'function') result.catch((error) => YM.log.warn('custom notification sound could not play', error));
            return;
          }
          unlockAudio();
          playTone(volume);
        } catch (error) {
          YM.log.warn('notification sound could not play', error);
        }
      };
      const seen = new Set(
        [...document.querySelectorAll(SELECTOR)].map((message) => message.dataset.messageId).filter(Boolean),
      );
      while (seen.size > 5000) seen.delete(seen.values().next().value);
      const markMessage = ({ id }) => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        if (seen.size > 5000) seen.delete(seen.values().next().value);
        playSound();
      };
      const onInteract = () => unlockAudio();
      document.addEventListener('pointerdown', onInteract, { capture: true, passive: true });
      document.addEventListener('keydown', onInteract, { capture: true, passive: true });
      const offDecorate = YM.messages.decorate(markMessage);
      ctx.cleanup(() => {
        document.removeEventListener('pointerdown', onInteract, { capture: true });
        document.removeEventListener('keydown', onInteract, { capture: true });
        try { offDecorate && offDecorate(); } catch (_) {}
        if (customAudio) {
          customAudio.pause();
          customAudio.removeAttribute('src');
          customAudio.load();
        }
        customAudio = null;
        customAudioSource = '';
        if (audioContext) audioContext.close().catch(() => {});
        audioContext = null;
      });
    },
  });
})();
