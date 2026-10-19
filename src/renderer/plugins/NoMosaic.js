// NoMosaic (port): several pictures in one message are shown one below the other at their real shape, not as a cropped grid.
(function () {
  YM.definePlugin({
    name: 'NoMosaic',
    description: 'Shows several pictures in one message one below the other, uncropped, instead of as a square grid.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Appearance', 'Chat'],
    start(ctx) {
      ctx.css(`
.msg-album{display:flex!important;flex-direction:column;width:auto!important;max-width:440px;overflow:visible!important;border-radius:0!important}
.msg-album .msg-album-cell{border-radius:10px;overflow:hidden}
.msg-album .msg-image,.msg-album.n-3 .msg-album-cell:first-child .msg-image{aspect-ratio:auto!important;height:auto!important;width:100%}
.msg-body .msg-album .msg-image img{height:auto!important;object-fit:contain!important;max-height:360px}
`);
    },
  });
})();
