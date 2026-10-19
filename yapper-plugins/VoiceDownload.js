// VoiceDownload (port): a download button for voice messages and audio files.
(function () {
  const AUDIO = /\.(ogg|oga|opus|mp3|wav|m4a|aac|flac|webm)(\?|$)/i;
  const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>';

  function urlFor(message) {
    if (!message || !message.attachment_path || String(message.attachment_path).startsWith('pending/')) return null;
    if (!message.voice_secs && !AUDIO.test(message.attachment_path)) return null;
    const mod = YM.finder.findExports(['publicUrl']);
    return mod ? mod.publicUrl('attachments', message.attachment_path) || null : null;
  }

  async function save(url, name) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const a = YM.dom.h('a', { href: URL.createObjectURL(blob), download: name });
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (err) {
      // The host may not allow reading it from this page: let the browser download the link itself.
      const a = YM.dom.h('a', { href: url, download: name, target: '_blank', rel: 'noopener' });
      document.body.append(a);
      a.click();
      a.remove();
    }
  }

  YM.definePlugin({
    name: 'VoiceDownload',
    description: 'Adds a download button to voice messages and audio files in chat.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Voice'],
    api: { urlFor, save },
    start(ctx) {
      ctx.cleanup(YM.messages.decorate(({ el, message }) => {
        const actions = el.querySelector(':scope > .msg-actions');
        const btn = actions && actions.querySelector('.ym-vd-btn');
        const url = urlFor(message);
        if (url && actions && !btn) {
          const ext = (String(message.attachment_path).match(/\.([a-z0-9]+)$/i) || [, 'ogg'])[1];
          actions.prepend(YM.dom.h('button', {
            class: 'icon-btn ym-vd-btn', type: 'button', title: 'Download audio', 'aria-label': 'Download audio', html: ICON,
            onClick: (e) => { e.stopPropagation(); save(url, 'voice-message-' + String(message.id).slice(0, 8) + '.' + ext); },
          }));
        } else if ((!url || !actions) && btn) btn.remove();
      }));
      ctx.cleanup(() => document.querySelectorAll('.ym-vd-btn').forEach((n) => n.remove()));
    },
  });
})();
