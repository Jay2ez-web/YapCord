import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dictionaryDir = path.join(root, 'node_modules', 'dictionary-en');
const aff = await fs.readFile(path.join(dictionaryDir, 'index.aff'), 'utf8');
const dic = await fs.readFile(path.join(dictionaryDir, 'index.dic'), 'utf8');
const entry = [
  "import nspell from 'nspell';",
  `const aff = ${JSON.stringify(aff)};`,
  `const dic = ${JSON.stringify(dic)};`,
  'window.YapCordSpellchecker = Object.freeze({ create: () => nspell({ aff, dic }) });',
].join('\n');

const outfile = path.join(root, 'src', 'renderer', 'plugins', 'AutoCorrectEngine.js');
await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: 'autocorrect-engine-entry.js', loader: 'js' },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  minify: true,
  legalComments: 'eof',
  outfile,
});
console.log(`Built offline spell-check engine: ${path.relative(root, outfile)} (${(await fs.stat(outfile)).size} bytes)`);
