// SplitLargeMessages: split oversized YapCord text into sequential messages.
// Inspired by Equicord's SplitLargeMessages (GPL-3.0-or-later); independently adapted to Yapper's REST message API.
(function () {
  function splitMessage(text, limit = 2000, mode = 'newlines') {
    if (typeof text !== 'string') return [];
    limit = Math.floor(Number(limit));
    if (!Number.isFinite(limit) || limit < 1) return [];
    if (!text.length) return [''];
    const chunks = [];
    let rest = text;
    while (rest.length > limit) {
      let end = limit;
      // Do not separate a UTF-16 surrogate pair at the boundary.
      if (end > 0 && end < rest.length && /[\uD800-\uDBFF]/.test(rest[end - 1]) && /[\uDC00-\uDFFF]/.test(rest[end])) end--;
      if (mode === 'newlines' || mode === 'spaces') {
        const boundary = mode === 'newlines' ? '\n' : ' ';
        const at = rest.lastIndexOf(boundary, end - 1);
        if (at > 0) end = at + 1;
        else if (mode === 'newlines') {
          const space = rest.lastIndexOf(' ', end - 1);
          if (space > 0) end = space + 1;
        }
      }
      // Extremely small limits or a boundary at index 0 must still make progress.
      if (end < 1) end = Math.min(limit, rest.length);
      chunks.push(rest.slice(0, end));
      rest = rest.slice(end);
    }
    if (rest) chunks.push(rest);
    return chunks;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const endpoint = /\/rest\/v1\/messages(?:\?|$)/;

  YM.definePlugin({
    name: 'SplitLargeMessages',
    description: 'Automatically splits long text messages into sequential messages at word or line breaks. Failed unsent text is returned to the composer when it is safe to do so.',
    authors: ['YapCord adaptation; inspired by Equicord'],
    tags: ['Chat', 'Utility'],
    enabledByDefault: true,
    api: { splitMessage },
    options: {
      limit: { type: 'number', default: 2000, min: 100, max: 2000, step: 50, description: 'Maximum text length per message (Yapper limit is typically 2000).' },
      splitMode: { type: 'select', default: 'newlines', options: [{ label: 'Prefer line breaks', value: 'newlines' }, { label: 'Prefer spaces', value: 'spaces' }, { label: 'Exact character limit', value: 'characters' }], description: 'Where to split when a message exceeds the limit.' },
      delayMs: { type: 'number', default: 1500, min: 500, max: 10000, step: 250, description: 'Delay between follow-up messages. This does not bypass server slowmode or rate limits.' },
    },
    start(ctx) {
      const pending = new WeakMap();
      let sendingFollowup = false;
      let sendQueue = Promise.resolve();
      const sendRemaining = async (task) => {
        await sleep(task.delayMs);
        while (task.chunks.length) {
          const chunk = task.chunks[0];
          const payload = { channel_id: task.channelId, content: chunk };
          let res;
          try {
            // Reuse the original authenticated request options; only ordinary message text is replayed.
            sendingFollowup = true;
            res = await window.fetch(task.url, { ...task.init, method: 'POST', body: JSON.stringify(payload) });
          } catch (err) {
            ctx.log.warn('a split-message follow-up could not be sent', err);
          } finally {
            sendingFollowup = false;
          }
          if (!res || !res.ok) {
            const unsent = task.chunks.join('');
            const state = YM.Store.getState();
            const composer = document.querySelector('.composer textarea');
            if (state && state.activeChannelId === task.channelId && composer instanceof HTMLTextAreaElement && !composer.value.trim()) {
              const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
              setter.call(composer, unsent);
              composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: unsent }));
              YM.toast('A follow-up message was rejected. The unsent text is back in the composer.', { type: 'error' });
            } else {
              try { await YM.util.copyText(unsent); } catch (_) {}
              YM.toast('A follow-up message was rejected. The remaining text was copied to your clipboard.', { type: 'error' });
            }
            return;
          }
          task.chunks.shift();
          if (task.chunks.length) await sleep(task.delayMs);
        }
      };
      const off = YM.net.onFetch({
        test(url, method) { return method === 'POST' && endpoint.test(url); },
        before(request) {
          if (sendingFollowup || !request.json || Array.isArray(request.json)) return;
          const row = request.json;
          if (!row || typeof row.content !== 'string') return;
          const opts = ctx.settings.store;
          const limit = Math.max(100, Math.min(2000, Number(opts.limit) || 2000));
          if (row.content.length <= limit) return;
          const chunks = splitMessage(row.content, limit, opts.splitMode || 'newlines');
          if (chunks.length < 2) return;
          const channelId = row.channel_id || row.channelId || null;
          if (!channelId) {
            YM.toast('Could not split this message because its channel was not available.', { type: 'error' });
            return;
          }
          const first = chunks.shift();
          row.content = first;
          pending.set(request, { url: request.url, init: { ...request.init }, channelId, chunks, delayMs: Math.max(500, Math.min(10000, Number(opts.delayMs) || 1500)) });
        },
        after(request, response) {
          const task = pending.get(request);
          if (!task) return;
          pending.delete(request);
          if (!response.ok || !task.chunks.length) return;
          sendQueue = sendQueue.then(() => sendRemaining(task)).catch((err) => ctx.log.warn('split-message queue failed', err));
          return sendQueue;
        },
      });
      ctx.cleanup(off);
    },
  });
})();
