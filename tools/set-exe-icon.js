'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { rcedit } = require('rcedit');

async function main() {
  const [exeArg, iconArg, mode] = process.argv.slice(2);
  if (!exeArg || !iconArg) {
    throw new Error('Usage: node tools/set-exe-icon.js <executable.exe> <icon.ico> [--icon-only]');
  }
  if (mode && mode !== '--icon-only') {
    throw new Error(`Unknown option: ${mode}`);
  }
  const exe = path.resolve(exeArg);
  const icon = path.resolve(iconArg);
  if (!fs.existsSync(exe) || !fs.existsSync(icon)) {
    throw new Error('The target executable or icon file does not exist.');
  }
  const version = require('../package.json').version;
  const options = { icon };
  if (mode !== '--icon-only') {
    Object.assign(options, {
      'file-version': `${version}.0`,
      'product-version': `${version}.0`,
      'version-string': {
        ProductName: 'YapCord',
        FileDescription: 'YapCord desktop app',
        InternalFilename: 'YapCord',
        OriginalFilename: 'YapCord.exe',
        ProductVersion: version,
        FileVersion: version,
        CompanyName: 'YapCord',
      },
    });
  }
  await rcedit(exe, options);
  console.log(`Embedded ${icon} in ${exe}${mode === '--icon-only' ? ' (icon only)' : ` (YapCord ${version})`}.`);
}

main().catch((err) => {
  console.error(`Could not set the YapCord executable icon: ${err.message}`);
  process.exitCode = 1;
});
