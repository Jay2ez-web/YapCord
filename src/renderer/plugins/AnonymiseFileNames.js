// AnonymiseFileNames (port): uploaded files get a random name instead of e.g. "Screenshot 2026-10-18 Tarik-PC.png".
(function () {
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  function extOf(name) {
    const m = /(\.tar)?\.[A-Za-z0-9]{1,8}$/.exec(name);
    return m ? m[0] : '';
  }

  function newName(name, { method = 'random', length = 8, consistent = 'image' } = {}) {
    const ext = extOf(name);
    let base;
    if (method === 'timestamp') base = String(Date.now());
    else if (method === 'consistent') base = String(consistent || 'image').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '') || 'image';
    else {
      const n = Math.max(1, Math.min(64, Math.round(Number(length) || 8)));
      const bytes = crypto.getRandomValues(new Uint8Array(n));
      base = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
    }
    return base + ext;
  }

  YM.definePlugin({
    name: 'AnonymiseFileNames',
    description: 'Gives uploaded files a random name so the original file name (which may contain your name or details) is not shared.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Privacy', 'Chat'],
    api: { newName },
    options: {
      method: {
        type: 'select', default: 'random', description: 'How to name files',
        options: [{ label: 'Random characters', value: 'random' }, { label: 'Timestamp', value: 'timestamp' }, { label: 'Same name every time', value: 'consistent' }],
      },
      length: { type: 'number', default: 8, description: 'Length of the random name' },
      consistent: { type: 'string', default: 'image', description: 'Name to use for "Same name every time"' },
    },
    start(ctx) {
      ctx.cleanup(
        YM.uploads.addFilter(
          async (files) => files.map((f) => {
            const s = ctx.settings.store;
            return new File([f], newName(f.name, s), { type: f.type, lastModified: f.lastModified });
          }),
          { order: 90, name: 'AnonymiseFileNames' },
        ),
      );
    },
  });
})();
