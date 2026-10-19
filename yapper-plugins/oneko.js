// oneko (port, with an original cat): a small cat follows your mouse pointer around the window. It sits down when it catches up and falls asleep after a while.
(function () {
  const BODY = '#c9ccd6';
  const SHADE = '#8f93a3';
  const svg = (inner) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">' + inner + '</svg>');

  const HEAD = `<path d="M18 9 20 4l3 4 3-4 2 5v5a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5V9z" fill="${BODY}"/><circle cx="21" cy="12.5" r="1" fill="#222"/><circle cx="26" cy="12.5" r="1" fill="#222"/><path d="M22.5 15h2l-1 1.2z" fill="#e07a8c"/>`;
  const FRAMES = {
    sit: svg(`<path d="M6 28c-3 0-4-6 0-8 0 3 3 3 4 2l2 6z" fill="${SHADE}"/><ellipse cx="14" cy="23" rx="8" ry="6" fill="${BODY}"/>${HEAD}<rect x="19" y="25" width="3" height="5" rx="1.5" fill="${BODY}"/><rect x="9" y="26" width="3" height="4" rx="1.5" fill="${BODY}"/>`),
    run1: svg(`<path d="M3 17c-1-4 3-6 5-4l1 4z" fill="${SHADE}"/><ellipse cx="14" cy="19" rx="10" ry="5" fill="${BODY}"/>${HEAD}<rect x="20" y="22" width="3" height="8" rx="1.5" fill="${BODY}" transform="rotate(-18 21 22)"/><rect x="7" y="22" width="3" height="8" rx="1.5" fill="${BODY}" transform="rotate(18 8 22)"/>`),
    run2: svg(`<path d="M3 15c-1-4 3-6 5-4l1 4z" fill="${SHADE}"/><ellipse cx="14" cy="19" rx="10" ry="5" fill="${BODY}"/>${HEAD}<rect x="20" y="22" width="3" height="8" rx="1.5" fill="${BODY}" transform="rotate(18 21 22)"/><rect x="7" y="22" width="3" height="8" rx="1.5" fill="${BODY}" transform="rotate(-18 8 22)"/>`),
    sleep: svg(`<path d="M4 27c-2-2 0-6 4-5l2 5z" fill="${SHADE}"/><ellipse cx="16" cy="25" rx="11" ry="5" fill="${BODY}"/><path d="M20 21 22 17l2 3 2-3 1 4z" fill="${BODY}"/><path d="M22 24h5" stroke="#222" stroke-width="1" stroke-linecap="round"/><text x="25" y="12" font-size="7" font-family="sans-serif" fill="#9aa0b4">z</text>`),
  };

  YM.definePlugin({
    name: 'oneko',
    description: 'A small cat follows your mouse pointer around Yapper. It sits when it reaches you and sleeps when you stop moving.',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Fun'],
    api: { FRAMES },
    options: {
      speed: { type: 'slider', default: 10, min: 4, max: 30, step: 1, description: 'How fast the cat runs' },
    },
    start(ctx) {
      const cat = YM.dom.h('div', { class: 'ym-oneko', 'aria-hidden': 'true' });
      let x = 32;
      let y = 32;
      let mx = 32;
      let my = 32;
      let idle = 0;
      let step = 0;
      let facing = 1;
      let frame = '';
      const show = (name) => { if (frame !== name) { frame = name; cat.style.backgroundImage = 'url("' + FRAMES[name] + '")'; } };
      const onMove = (e) => { mx = e.clientX; my = e.clientY; idle = 0; };
      document.addEventListener('mousemove', onMove, true);
      (document.body || document.documentElement).append(cat);
      show('sit');
      ctx.interval(() => {
        if (document.hidden) return;
        const dx = mx - x;
        const dy = my - y;
        const dist = Math.hypot(dx, dy);
        if (dist < 40) {
          idle++;
          show(idle > 60 ? 'sleep' : 'sit');
        } else {
          idle = 0;
          const speed = Math.min(Number(ctx.settings.store.speed) || 10, dist);
          x += (dx / dist) * speed;
          y += (dy / dist) * speed;
          if (Math.abs(dx) > 4) facing = dx > 0 ? 1 : -1;
          show(++step % 2 ? 'run1' : 'run2');
        }
        cat.style.transform = 'translate(' + Math.round(x - 16) + 'px,' + Math.round(y - 16) + 'px) scaleX(' + facing + ')';
      }, 100);
      ctx.cleanup(() => {
        document.removeEventListener('mousemove', onMove, true);
        cat.remove();
      });
      ctx.css('.ym-oneko{position:fixed;left:0;top:0;width:32px;height:32px;z-index:2147483000;pointer-events:none;background:center/contain no-repeat;image-rendering:auto}');
    },
  });
})();
