// PictureInPicture: add a local picture-in-picture action for message videos.
// Uses the standard media API on the existing element; no cloned media, remote fetch, or Electron privilege bridge.
(() => {
  const BUTTON = 'ym-pip-button';
  const h = YM.dom.h;
  function mount({ el }) {
    const video = el.querySelector('video');
    if (!(video instanceof HTMLVideoElement)) return;
    const row = el;
    const actions = row.querySelector(':scope > .msg-actions');
    if (!actions || actions.querySelector('.' + BUTTON)) return;
    const button = h('button', {
      class: 'icon-btn ' + BUTTON,
      type: 'button',
      title: 'Picture in picture',
      'aria-label': 'Picture in picture',
      onClick: async (event) => {
        event.stopPropagation();
        try {
          if (!document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== 'function') {
            throw new Error('Picture-in-picture is not available for this video.');
          }
          await video.requestPictureInPicture();
        } catch (error) {
          YM.toast((error && error.message) || 'Could not open picture-in-picture.', { type: 'error' });
        }
      },
    }, 'PiP');
    actions.prepend(button);
  }
  YM.definePlugin({
    name: 'PictureInPicture',
    description: 'Add a Picture-in-Picture button to message videos when the browser supports it.',
    authors: ['YapCord contributors'],
    tags: ['Media', 'Utility'],
    enabledByDefault: false,
    start(ctx) {
      ctx.cleanup(YM.messages.decorate(mount));
      ctx.cleanup(() => document.querySelectorAll('.' + BUTTON).forEach((button) => button.remove()));
    },
  });
})();
