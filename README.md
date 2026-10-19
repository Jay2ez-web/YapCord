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

Install the dependencies from `package.json`, then package the Electron app using the project’s normal Electron builder workflow. Generate the update manifest beside the published installer:

```bash
python tools/make-update-manifest.py YapCord1.0-auto-update.exe --version 1.0.0 --url https://github.com/Jay2ez-web/YapCord/releases/download/v1.0.0/YapCord1.0-auto-update.exe
```

Publish the installer and `latest.json` as assets of the same GitHub release. For production distribution, sign the installer and keep the version consistent in `package.json`, the release tag, and the manifest.

## Plugin count

The recovered installer contains **107 plugin files**. The canonical source tree is `src/`; the older compatibility directories in this repository are retained only for historical/reference purposes.

## Safety

The updater validates HTTPS, the release version, the download size, and the SHA-512 digest before offering installation. Review release assets and sign production installers before distributing them.