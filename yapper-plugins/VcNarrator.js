// VcNarrator (port): a voice announces when someone joins or leaves the voice channel you are in.
(function () {
  /** Who is in a channel, by user id. */
  const ids = (list) => new Set((list || []).map((m) => m.userId));

  function changes(prevList, nextList) {
    const a = ids(prevList);
    const b = ids(nextList);
    return { joined: [...b].filter((x) => !a.has(x)), left: [...a].filter((x) => !b.has(x)) };
  }

  YM.definePlugin({
    name: 'VcNarrator',
    description: 'Reads out with a voice (the one of your system) who joins or leaves the voice channel you are in.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Voice', 'Accessibility'],
    api: { changes },
    options: {
      volume: { type: 'slider', default: 1, min: 0, max: 1, step: 0.05, description: 'Volume of the voice' },
      rate: { type: 'slider', default: 1, min: 0.5, max: 2, step: 0.1, description: 'Speed of the voice' },
      joinText: { type: 'string', default: '{{USER}} joined', description: 'Text when someone joins ({{USER}} = name)' },
      leaveText: { type: 'string', default: '{{USER}} left', description: 'Text when someone leaves' },
      you: { type: 'boolean', default: false, description: 'Also announce yourself' },
    },
    start(ctx) {
      const say = (text) => {
        if (!('speechSynthesis' in window) || !text) return;
        const u = new SpeechSynthesisUtterance(text);
        u.volume = Number(ctx.settings.store.volume);
        u.rate = Number(ctx.settings.store.rate);
        speechSynthesis.speak(u);
      };
      ctx.on('store:change', (s, p) => {
        if (s.voiceMembers === p.voiceMembers || !s.voice || !s.voice.channelId) return;
        const ch = s.voice.channelId;
        if (!p.voice || p.voice.channelId !== ch) return; // you just came in: not every person already there needs announcing
        const { joined, left } = changes(p.voiceMembers[ch], s.voiceMembers[ch]);
        const me = s.userId;
        const o = ctx.settings.store;
        const nameOf = (id) => YM.Store.displayName(id);
        for (const id of joined) if (o.you || id !== me) say(String(o.joinText).replace(/\{\{USER\}\}/g, nameOf(id)));
        for (const id of left) if (o.you || id !== me) say(String(o.leaveText).replace(/\{\{USER\}\}/g, nameOf(id)));
      });
      ctx.cleanup(() => { try { speechSynthesis.cancel(); } catch (_) { /* no speech */ } });
    },
  });
})();
