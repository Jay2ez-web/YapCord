// Experimental 1.2: export the currently loaded channel locally without sending data anywhere.
(function () {
  function currentMessages() {
    const state = YM.Store.getState();
    const channelId = state && state.activeChannelId;
    const rows = state && state.messages && channelId && state.messages[channelId];
    return { channelId, messages: Array.isArray(rows) ? rows.slice() : [] };
  }
  function safeText(value) {
    return String(value == null ? '' : value).replace(/\r\n/g, '\n');
  }
  function download(text, type, extension) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yapcord-messages-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  YM.definePlugin({
    name: 'ExportMessages',
    description: 'Export the currently loaded channel locally as JSON, Markdown, or plain text (Ctrl/Cmd+Shift+E).',
    authors: ['YapCord 1.2 experimental'],
    tags: ['Chat', 'Utility'],
    enabledByDefault: false,
    options: {
      format: {
        type: 'select',
        default: 'markdown',
        description: 'Export format',
        options: [
          { label: 'Markdown', value: 'markdown' },
          { label: 'Plain text', value: 'text' },
          { label: 'JSON', value: 'json' },
        ],
      },
    },
    start(ctx) {
      const onKey = (event) => {
        if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 'e') return;
        event.preventDefault();
        const { channelId, messages } = currentMessages();
        if (!channelId || !messages.length) return YM.toast('There are no loaded messages to export.', { type: 'error' });
        const format = ctx.settings.store.format || 'markdown';
        if (format === 'json') {
          download(JSON.stringify({ channelId, exportedAt: new Date().toISOString(), messages }, null, 2), 'application/json', 'json');
        } else if (format === 'text') {
          download(messages.map((m) => `[${safeText(m.created_at || '')}] ${safeText(m.author_id || 'unknown')}: ${safeText(m.content)}`).join('\n'), 'text/plain', 'txt');
        } else {
          download(messages.map((m) => `- **${safeText(m.author_id || 'unknown')}** · ${safeText(m.created_at || '')}\n  ${safeText(m.content).replace(/\n/g, '\n  ')}`).join('\n'), 'text/markdown', 'md');
        }
        YM.toast(`Exported ${messages.length} loaded message${messages.length === 1 ? '' : 's'}.`, { type: 'success' });
      };
      document.addEventListener('keydown', onKey, true);
      ctx.cleanup(() => document.removeEventListener('keydown', onKey, true));
    },
  });
})();
