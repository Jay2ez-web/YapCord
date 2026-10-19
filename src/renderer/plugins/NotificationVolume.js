// NotificationVolume (port): volume of Yapper's message ping (0-100%).
(function () {
  YM.definePlugin({
    name: 'NotificationVolume',
    description: 'Sets the volume of the message notification sound.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Notifications', 'Voice'],
    options: {
      volume: { type: 'slider', default: 50, min: 0, max: 100, step: 5, description: 'Notification volume (%)' },
    },
    start(ctx) {
      ctx.cleanup(YM.media.onSound(({ kind, node }) => {
        if (kind !== 'buffer' || YM.media.soundOf(node) !== 'message') return undefined;
        const vol = Math.max(0, Math.min(100, Number(ctx.settings.store.volume))) / 100;
        if (vol === 0) return false;
        if (vol >= 1) return undefined;
        try {
          const audio = node.context;
          const gain = audio.createGain();
          gain.gain.value = vol;
          node.disconnect();
          node.connect(gain);
          gain.connect(audio.destination);
        } catch (err) {
          ctx.log.warn('could not change the volume', err);
        }
        return undefined;
      }));
    },
  });
})();
