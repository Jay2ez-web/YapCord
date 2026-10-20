// Notification Tweaks (native): play a short local sound when a new message appears.
(function () {
  YM.definePlugin({
    name: 'Notification Tweaks',
    description: 'Play a short local sound when a new message appears.',
    authors: ['YapCord'],
    tags: ['Chat', 'Notifications'],
    enabledByDefault: false,
    options: {
      volume: { type: 'slider', default: 55, min: 5, max: 100, step: 5, description: 'Sound volume (%)' },
    },
    start(ctx) {
      let audioContext = null;
      let lastPlayed = 0;
      const SELECTOR = 'div.msg[data-message-id]';
      const unlockAudio = () => {
        try {
          if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
          if (audioContext.state === 'suspended') audioContext.resume();
        } catch (_) { /* ignore */ }
      };
      const playSound = () => {
        if (Date.now() - lastPlayed < 250) return;
        lastPlayed = Date.now();
        try {
          unlockAudio();
          if (!audioContext || audioContext.state === 'suspended') return;
          const vol = Math.max(0.05, Math.min(1, (Number(ctx.settings.store.volume) || 55) / 100));
          const now = audioContext.currentTime;
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(660, now);
          oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.08);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(Math.max(0.0011, vol * 0.1), now + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
          oscillator.connect(gain);
          gain.connect(audioContext.destination);
          oscillator.start(now);
          oscillator.stop(now + 0.18);
        } catch (_) { /* ignore */ }
      };
      const seen = new Set(
        [...document.querySelectorAll(SELECTOR)].map((m) => m.dataset.messageId).filter(Boolean),
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
        if (audioContext) audioContext.close().catch(() => {});
        audioContext = null;
      });
    },
  });
})();
