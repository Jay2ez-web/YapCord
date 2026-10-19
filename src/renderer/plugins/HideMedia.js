// HideMedia (port): hide the pictures/videos of a single message behind a hover button.
(function () {
  const MEDIA = '.msg-image,.msg-video-box,.msg-album,.msg-linkimgs,.msg-audio';
  const EYE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="ym-hm-slash" d="M4 4l16 16"/></svg>';

  YM.definePlugin({
    name: 'HideMedia',
    description: 'Adds a button to messages with pictures or videos to hide or show their media.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Chat', 'Privacy'],
    start(ctx) {
      const h = YM.dom.h;
      const hidden = new Set();

      ctx.cleanup(YM.messages.decorate(({ el, id, body }) => {
        if (!body) return;
        const hasMedia = !!body.querySelector(MEDIA);
        const actions = el.querySelector(':scope > .msg-actions');
        const isHidden = hidden.has(id);

        const mark = el.querySelector(':scope > .ym-hm-mark');
        if (isHidden && !mark) el.append(h('span', { class: 'ym-hm-mark', hidden: true }));
        else if (!isHidden && mark) mark.remove();

        const note = body.querySelector(':scope > .ym-hm-note');
        if (isHidden && !note) {
          body.append(h('div', { class: 'ym-hm-note' }, 'Media hidden · ',
            h('button', { class: 'ym-link', type: 'button', onClick: (e) => { e.stopPropagation(); hidden.delete(id); YM.messages.refresh(); } }, 'show')));
        } else if (!isHidden && note) note.remove();

        const btn = actions && actions.querySelector('.ym-hm-btn');
        if (hasMedia && actions && !btn) {
          actions.prepend(h('button', {
            class: 'icon-btn ym-hm-btn', type: 'button', title: 'Hide media', 'aria-label': 'Hide media', html: EYE,
            onClick: (e) => {
              e.stopPropagation();
              hidden.has(id) ? hidden.delete(id) : hidden.add(id);
              YM.messages.refresh();
            },
          }));
        } else if ((!hasMedia || !actions) && btn) btn.remove();
      }));

      ctx.cleanup(() => document.querySelectorAll('.ym-hm-mark,.ym-hm-note,.ym-hm-btn').forEach((n) => n.remove()));
      ctx.css(`
.msg:has(> .ym-hm-mark) :is(.msg-image,.msg-video-box,.msg-album,.msg-linkimgs,.msg-audio){display:none!important}
.ym-hm-note{margin-top:4px;font-size:12px;color:var(--text-muted)}
.ym-hm-note .ym-link{all:unset;cursor:pointer;text-decoration:underline}
.ym-hm-slash{display:none}.msg:has(> .ym-hm-mark) .ym-hm-slash{display:inline}
`);
    },
  });
})();
