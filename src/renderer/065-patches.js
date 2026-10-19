// Vencord-style source patches. A plugin may declare:
//   patches: [{ find: 'unique string in the module', replacement: { match: /regex|string/, replace: '$&...' | fn } | [..] }]
// The patched factory is rebuilt with indirect eval (no CSP on yapper.website). If a patch does not match, the module
// is left untouched and the failure is reported in Settings > Diagnostics.

const list = []; // { plugin, find, replacements[], applied, failed }
const P = (YM.patches = {
  register(pluginName, patches) {
    for (const p of patches || []) {
      const reps = [].concat(p.replacement || []);
      list.push({ plugin: pluginName, find: p.find, replacements: reps, applied: 0, failed: [], predicate: p.predicate });
    }
  },
  unregister(pluginName) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].plugin === pluginName) list.splice(i, 1);
  },
  active: () => list.length > 0,
  report: () =>
    list.map((p) => ({ plugin: p.plugin, find: String(p.find), applied: p.applied, failed: p.failed.slice(0, 5) })),

  /** Returns a patched copy of `factory`, or null when nothing applies. */
  apply(factory, ids) {
    let src = null;
    let patched = null;
    for (const p of list) {
      if (p.predicate && !p.predicate()) continue;
      if (src === null) {
        try {
          src = String(factory);
        } catch (_) {
          return null;
        }
        patched = src;
      }
      if (p.find instanceof RegExp) p.find.lastIndex = 0; // a /g or /y regex would otherwise remember its position
      const hit = typeof p.find === 'string' ? src.includes(p.find) : p.find.test(src);
      if (p.find instanceof RegExp) p.find.lastIndex = 0;
      if (!hit) continue;
      let current = patched;
      let ok = true;
      for (const rep of p.replacements) {
        const before = current;
        try {
          current = current.replace(rep.match, rep.replace);
        } catch (err) {
          ok = false;
          p.failed.push(String(err && err.message));
          break;
        }
        if (current === before) {
          ok = false;
          p.failed.push('replacement did not match: ' + String(rep.match).slice(0, 80));
          break;
        }
      }
      if (!ok) continue;
      patched = current;
      p.applied++;
    }
    if (patched === null || patched === src) return null;
    try {
      // eslint-disable-next-line no-eval
      const fn = (0, eval)('(' + patched + ')\n//# sourceURL=yappermod://patched/' + String(ids && ids[0]));
      if (typeof fn !== 'function') throw new Error('patched module is not a function');
      fn.__ym = true;
      fn.__orig = factory.__orig || factory;
      return fn;
    } catch (err) {
      YM.log.error('patched module failed to compile', ids, err);
      return null;
    }
  },
});
