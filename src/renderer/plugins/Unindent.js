// Unindent (port): trims the shared leading indentation of code blocks in the messages you send.
(function () {
  function unindent(content) {
    return content.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (whole, lang, body) => {
      const lines = body.split('\n');
      let min = Infinity;
      for (const l of lines) {
        if (!l.trim()) continue;
        const m = /^[ \t]*/.exec(l)[0].length;
        if (m < min) min = m;
      }
      if (!Number.isFinite(min) || min === 0) return whole;
      return '```' + lang + '\n' + lines.map((l) => l.slice(Math.min(min, /^[ \t]*/.exec(l)[0].length))).join('\n') + '```';
    });
  }

  YM.definePlugin({
    name: 'Unindent',
    description: 'Removes the extra indentation from code blocks in messages you send (handy when you paste code from the middle of a file).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Utility'],
    api: { unindent },
    start(ctx) {
      const handler = (msg) => { if (msg.content.includes('```')) msg.content = unindent(msg.content); };
      ctx.cleanup(YM.messageEvents.addPreSendListener(handler));
      ctx.cleanup(YM.messageEvents.addPreEditListener(handler));
    },
  });
})();
