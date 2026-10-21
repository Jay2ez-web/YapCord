// Quoter: export a local quote card from a message; all rendering stays on this device.
// Inspired by Equicord Quoter (GPL-3.0-or-later); independently implemented for YapCord's message DOM.
(function () {
  const MAX_QUOTE_LENGTH = 1200;

  function wrapText(text, maxWidth, measure) {
    const lines = [];
    for (const paragraph of String(text || '').split(/\r?\n/)) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      let line = '';
      for (const word of words) {
        const candidate = line ? line + ' ' + word : word;
        if (line && measure(candidate) > maxWidth) { lines.push(line); line = word; }
        else line = candidate;
        while (measure(line) > maxWidth && line.length > 1) {
          let cut = line.length - 1;
          if (cut > 0 && /[\uD800-\uDBFF]/.test(line[cut - 1]) && /[\uDC00-\uDFFF]/.test(line[cut])) cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  function drawCard(message, profile) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas rendering is unavailable.');

    const background = ctx.createLinearGradient(0, 0, 1200, 630);
    background.addColorStop(0, '#171421');
    background.addColorStop(0.55, '#30214d');
    background.addColorStop(1, '#5d3b88');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(175, 132, 255, .16)';
    ctx.beginPath(); ctx.arc(1090, 25, 330, 0, Math.PI * 2); ctx.fill();

    const raw = String(message.content || '').trim();
    const quote = raw.length > MAX_QUOTE_LENGTH ? raw.slice(0, MAX_QUOTE_LENGTH - 1) + '…' : raw;
    const author = profile && (profile.display_name || profile.username) || 'YapCord user';
    const username = profile && profile.username ? '@' + profile.username : '';
    const maxWidth = 940;
    let fontSize = 46;
    let lines;
    do {
      ctx.font = '500 ' + fontSize + 'px system-ui, sans-serif';
      lines = wrapText(quote || ' ', maxWidth, (s) => ctx.measureText(s).width);
      if (lines.length <= 8 || fontSize <= 30) break;
      fontSize -= 2;
    } while (fontSize >= 30);
    if (lines.length > 9) lines = lines.slice(0, 8).concat([lines[8].slice(0, 80) + '…']);

    const lineHeight = fontSize * 1.36;
    const quoteHeight = lines.length * lineHeight;
    let y = Math.max(190, (canvas.height - quoteHeight) / 2 - 20);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '500 ' + fontSize + 'px system-ui, sans-serif';
    for (const line of lines) {
      ctx.fillText(line, 130, y, maxWidth);
      y += lineHeight;
    }
    y = Math.min(525, y + 22);
    ctx.fillStyle = '#d5c0ff';
    ctx.fillRect(130, y, 54, 4);
    y += 24;
    ctx.fillStyle = '#fff';
    ctx.font = '700 25px system-ui, sans-serif';
    ctx.fillText(author.slice(0, 80), 130, y);
    if (username) {
      ctx.fillStyle = 'rgba(255,255,255,.68)';
      ctx.font = '400 18px system-ui, sans-serif';
      ctx.fillText(username.slice(0, 80), 130, y + 32);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText('YAPCORD', 1068, 582);
    return canvas;
  }

  async function downloadQuote(message, profile) {
    const canvas = drawCard(message, profile);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not export the quote image.')), 'image/png'));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = String(profile && (profile.username || profile.display_name) || 'message').replace(/[^\w-]+/g, '-').slice(0, 48) || 'message';
    a.href = url;
    a.download = 'YapCord-quote-' + safeName + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  YM.definePlugin({
    name: 'Quoter',
    description: 'Adds a quote-image button to messages. Generates a YapCord-styled PNG locally and downloads it; no external fonts, images, or services are used.',
    authors: ['YapCord adaptation; inspired by Equicord'],
    tags: ['Chat', 'Media'],
    enabledByDefault: true,
    api: { wrapText, drawCard, downloadQuote },
    start(ctx) {
      const h = YM.dom.h;
      ctx.cleanup(YM.messages.decorate(({ el, message }) => {
        const actions = el.querySelector(':scope > .msg-actions');
        if (!actions) return;
        const existing = actions.querySelector('.ym-quoter-btn');
        if (!message || !String(message.content || '').trim()) { if (existing) existing.remove(); return; }
        if (existing) {
          existing.__ymQuoteMessage = message;
          existing.__ymQuoteAuthorId = message.author_id;
          return;
        }
        const button = h('button', {
          type: 'button', class: 'icon-btn ym-quoter-btn', title: 'Create quote image', 'aria-label': 'Create quote image',
          onClick: async (event) => {
            event.stopPropagation();
            button.disabled = true;
            try {
              const current = button.__ymQuoteMessage;
              await downloadQuote(current, YM.Store.profile(button.__ymQuoteAuthorId));
              YM.toast('Quote image downloaded.', { type: 'success' });
            } catch (err) {
              YM.toast((err && err.message) || 'Could not create quote image.', { type: 'error' });
            } finally { button.disabled = false; }
          },
        }, '“');
        button.__ymQuoteMessage = message;
        button.__ymQuoteAuthorId = message.author_id;
        actions.append(button);
      }));
      ctx.cleanup(() => document.querySelectorAll('.ym-quoter-btn').forEach((node) => node.remove()));
      ctx.css('.ym-quoter-btn{font-size:19px!important;line-height:1!important;font-weight:700!important}.ym-quoter-btn:disabled{opacity:.5;cursor:wait}');
    },
  });
})();
