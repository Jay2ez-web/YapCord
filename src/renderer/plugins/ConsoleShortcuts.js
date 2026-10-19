// ConsoleShortcuts (port): handy globals in the DevTools console (Ctrl+Shift+I).
(function () {
  const NAMES = ['ym', 'ymStore', 'ymState', 'ymFind', 'ymFindSource', 'ymPlugins', 'ymDiag'];
  YM.definePlugin({
    name: 'ConsoleShortcuts',
    description: 'Adds shortcuts to the console: ym, ymState(), ymStore, ymFind("name", ...), ymFindSource("text"), ymPlugins, ymDiag().',
    authors: ['Vencord (ported to Yapper)'],
    tags: ['Developers'],
    start(ctx) {
      const w = window;
      w.ym = YM;
      w.ymState = () => YM.Store.getState();
      w.ymFind = (...names) => YM.finder.findExports(names);
      w.ymFindSource = (...strings) => YM.finder.findIdsBySource(strings);
      w.ymPlugins = YM.plugins;
      w.ymDiag = () => YM.diagnostics();
      Object.defineProperty(w, 'ymStore', { configurable: true, get: () => YM.Store.api });
      ctx.cleanup(() => NAMES.forEach((n) => { try { delete w[n]; } catch (_) { w[n] = undefined; } }));
    },
  });
})();
