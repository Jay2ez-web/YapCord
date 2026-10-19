// PlainFolderIcon (port): a closed folder in the server list shows a plain folder icon instead of four small server icons.
(function () {
  const FOLDER = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M3 6.5A2.5 2.5 0 0 1 5.5 4h4.1c.5 0 1 .2 1.4.6l1.4 1.4H18.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z'/></svg>\")";
  YM.definePlugin({
    name: 'PlainFolderIcon',
    description: 'Closed server folders show a plain folder icon instead of the small icons of the servers inside.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Appearance', 'Servers'],
    start(ctx) {
      ctx.css(`
.rail-folder:not(.open) .folder-grid{display:none!important}
.rail-folder:not(.open)::after{content:"";width:24px;height:24px;background:var(--folder,currentColor);-webkit-mask:${FOLDER} center/contain no-repeat;mask:${FOLDER} center/contain no-repeat;position:absolute;inset:0;margin:auto}
`);
    },
  });
})();
