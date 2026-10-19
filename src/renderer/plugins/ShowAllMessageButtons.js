// ShowAllMessageButtons (port): the message action bar (react, reply, more) is always visible instead of only on hover.
(function () {
  YM.definePlugin({
    name: 'ShowAllMessageButtons',
    description: 'Always shows the message action buttons (react, reply, more) instead of only when you hover a message.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Appearance', 'Chat'],
    start(ctx) {
      ctx.css('.msg:not(.pending):not(.blocked-msg) .msg-actions{display:flex!important;opacity:.55;position:static;margin:2px 0 0;box-shadow:none;border-color:transparent;background:transparent;width:max-content}\n.msg:hover .msg-actions{opacity:1}');
    },
  });
})();
