// A small dialog for plugins (YM.modal.open): title, a body of DOM nodes, buttons. Esc and a click outside close it.

const modal = (YM.modal = {});

/**
 * @param {{ title: string, subtitle?: string, body?: Node|Node[]|string, buttons?: {label:string, onClick?:(close:Function)=>void, danger?:boolean}[], wide?: boolean }} o
 * @returns {{ close: Function, el: HTMLElement }}
 */
modal.open = function open(o) {
  const h = YM.dom.h;
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    el.remove();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const buttons = (o.buttons || []).map((b) => h('button', { type: 'button', class: 'ym-btn' + (b.danger ? ' ym-btn-danger' : ''), onClick: () => (b.onClick ? b.onClick(close) : close()) }, b.label));
  buttons.push(h('button', { type: 'button', class: 'ym-btn ym-btn-ghost', onClick: close }, 'Close'));
  const el = h('div', { class: 'ym-modal', onClick: (e) => { if (e.target === el) close(); } },
    h('div', { class: 'ym-modal-card' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-label': o.title },
      h('div', { class: 'ym-modal-head' }, h('h2', {}, o.title), o.subtitle ? h('p', {}, o.subtitle) : null),
      h('div', { class: 'ym-modal-body' }, o.body),
      h('div', { class: 'ym-modal-foot' }, buttons)));
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(el);
  return { close, el };
};

YM.dom.css.set('modal', `
.ym-modal{position:fixed;inset:0;z-index:2147482500;background:rgba(8,9,12,.62);backdrop-filter:blur(4px);display:grid;place-items:center;padding:20px}
.ym-modal-card{width:min(460px,100%);max-height:86vh;display:flex;flex-direction:column;border-radius:16px;background:var(--bg-main,#1e1f24);color:var(--text,#f2f3f5);border:1px solid var(--border,rgba(255,255,255,.08));box-shadow:0 12px 40px rgba(0,0,0,.5);font:14px/1.45 Inter,system-ui,sans-serif}
.ym-modal-card.wide{width:min(680px,100%)}
.ym-modal-head{padding:18px 20px 6px}.ym-modal-head h2{margin:0;font-size:19px;letter-spacing:-.01em}.ym-modal-head p{margin:4px 0 0;color:var(--text-muted,#a6a8b0);font-size:13px}
.ym-modal-body{padding:8px 20px 12px;overflow:auto}
.ym-modal-foot{display:flex;gap:8px;justify-content:flex-end;padding:12px 20px 16px;border-top:1px solid var(--border,rgba(255,255,255,.08))}
.ym-kv{display:grid;grid-template-columns:140px 1fr;gap:6px 12px;margin:0}.ym-kv dt{color:var(--text-muted,#a6a8b0)}.ym-kv dd{margin:0;word-break:break-word}
.ym-chip{display:inline-flex;align-items:center;gap:6px;margin:2px 4px 2px 0;padding:2px 8px;border-radius:999px;background:var(--bg-elev,rgba(255,255,255,.08));font-size:12px}
.ym-chip i{width:9px;height:9px;border-radius:50%;display:inline-block;background:var(--text-faint,#888)}
.ym-sub{margin:14px 0 6px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted,#a6a8b0)}
.ym-perm-list{display:flex;flex-wrap:wrap;gap:4px}.ym-perm{padding:2px 8px;border-radius:6px;font-size:12px;background:rgba(59,165,93,.18);color:#7fd69a}.ym-perm.no{background:rgba(255,255,255,.06);color:var(--text-faint,#8b8d96);text-decoration:line-through}.ym-perm.danger{background:rgba(237,66,69,.18);color:#f3898b}
`);

YM.dom.css.set('modal-motion', '@media (prefers-reduced-motion:no-preference){.ym-modal-card{animation:ymPop .16s ease-out}@keyframes ymPop{from{transform:translateY(6px) scale(.98);opacity:0}}}');
