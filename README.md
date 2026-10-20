# YapCord

Recovered full source for the YapCord Electron client, synchronized from the supplied installer and extended with a staged Windows auto-updater.

## Included

- Complete Electron application source under `src/`
- All **107** renderer plugins under `src/renderer/plugins/`
- Original renderer UI and themes
- Main-process updater service (`src/main/updater.js`)
- Trusted IPC/preload update bridge and Settings updater controls
- Release manifest helper in `tools/make-update-manifest.py`

The updater checks the published `latest.json` release manifest, downloads the installer to a staging directory, verifies its SHA-512 digest, and offers a restart/install action. It does not execute an unverified download. Update checks run only in packaged Windows builds; browser/source development mode uses the fallback bridge.

## Build and publish

### Build the Windows setup EXE

The repository includes a portable NSIS setup script and a build helper. The helper uses a supplied YapCord Windows installer as the Electron runtime base, then replaces its `app.asar` with the current `package.json`, `src/`, `themes/`, and app icon from this checkout. It does not run or modify the supplied base installer.

Run from a Linux/WSL shell with Node.js/npm, 7-Zip (`7z`), and NSIS (`makensis`), from the repository root:

```bash
npm ci
npm run build:win-installer -- /path/to/YapCord1.07.exe
```

The output is `YapCord 1.0.exe` in the repository root by default. Pass a second path to choose another output location. The produced setup is unsigned unless you sign it separately; Windows may display a security warning.

### Release updates

Generate the update manifest beside the published installer:

```bash
python tools/make-update-manifest.py YapCord1.0-auto-update.exe --version 1.0.0 --url https://github.com/Jay2ez-web/YapCord/releases/download/v1.0.0/YapCord1.0-auto-update.exe
```

Publish the installer and `latest.json` as assets of the same GitHub release. For production distribution, sign the installer and keep the version consistent in `package.json`, the release tag, and the manifest.

## Plugin count

The recovered installer contains **107 plugin files**. The canonical source tree is `src/`; the older compatibility directories in this repository are retained only for historical/reference purposes.

## Safety

The updater validates HTTPS, the release version, the download size, and the SHA-512 digest before offering installation. Review release assets and sign production installers before distributing them.
