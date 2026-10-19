// RoundedCorners: make Yapper's corners sharper or rounder, and pick the shape of avatars.
(function () {
  YM.definePlugin({
    name: 'RoundedCorners',
    description: 'Make menus, dialogs, the message box and buttons sharper or rounder, and choose round, rounded or square avatars.',
    authors: ['YapCord'],
    tags: ['Appearance', 'Customisation'],
    options: {
      radius: { type: 'slider', default: 14, min: 0, max: 28, step: 1, description: 'Corner size (Yapper uses 10)' },
      avatars: {
        type: 'select', default: 'round', description: 'Avatar shape',
        options: [{ label: 'Round', value: 'round' }, { label: 'Rounded square', value: 'soft' }, { label: 'Square', value: 'square' }],
      },
    },
    start(ctx) {
      const apply = () => {
        const s = ctx.settings.store;
        const r = Math.max(0, Math.min(28, Number(s.radius) || 0));
        const av = s.avatars === 'square' ? '0' : s.avatars === 'soft' ? '28%' : '';
        ctx.css(':root{--radius:' + r + 'px}.composer-box,.ctx-menu,.modal,.emoji-picker,.profile-card,.mention-menu,.btn{border-radius:' + r + 'px}' + (av ? '.avatar,.avatar img{border-radius:' + av + '!important}' : ''), 'corners');
      };
      apply();
      ctx.cleanup(ctx.settings.onChange(apply));
    },
  });
})();
