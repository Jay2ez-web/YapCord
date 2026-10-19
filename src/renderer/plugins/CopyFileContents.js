// CopyFileContents (port): a "Copy text" button on text file attachments.
(function () {
  const TEXT = /\.(txt|md|json|js|ts|jsx|tsx|css|html?|xml|ya?ml|toml|ini|cfg|conf|log|csv|py|java|c|h|cpp|cs|go|rs|rb|php|sh|bat|ps1|sql|lua|kt|swift|properties|gradle)$/i;
  const MAX = 1024 * 1024;

  async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX) throw new Error('too large');
    const blob = await res.blob();
    if (blob.size > MAX) throw new Error('too large');
    return blob.text();
  }

  YM.definePlugin({
    name: 'CopyFileContents',
    description: 'Adds a button to text and code file attachments that copies the contents to your clipboard (files up to 1 MB).',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Utility'],
    api: { fetchText, TEXT },
    start(ctx) {
      const h = YM.dom.h;
      ctx.cleanup(YM.messages.decorate(({ el }) => {
        el.querySelectorAll(':scope .file-card').forEach((card) => {
          if (card.querySelector('.ym-copyfile')) return;
          const link = card.querySelector('a[download][href]');
          const name = (card.querySelector('.file-card-name') || {}).textContent || '';
          if (!link || !TEXT.test(name)) return;
          link.before(h('button', {
            class: 'btn small secondary ym-copyfile', type: 'button', style: 'margin-right:6px',
            onClick: async (e) => {
              e.preventDefault(); e.stopPropagation();
              try {
                const text = await fetchText(link.href);
                YM.toast((await YM.util.copyText(text)) ? 'Copied ' + name : 'Could not copy.', { type: 'success' });
              } catch (err) {
                YM.toast(err && err.message === 'too large' ? 'That file is over 1 MB.' : 'Could not read ' + name + '.', { type: 'error' });
              }
            },
          }, 'Copy text'));
        });
      }));
      ctx.cleanup(() => document.querySelectorAll('.ym-copyfile').forEach((n) => n.remove()));
    },
  });
})();
