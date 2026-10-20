# YapCord

YapCord is a desktop client built on Yapper. The standalone Windows app is branded **YapCord** and installed as **YapCord 1.0**.

## Profiles and included features

The standalone installer keeps settings, themes, logs, and the login session in `%APPDATA%\YapCord1.0`. The optional in-Yapper integration keeps its separate profile in `%APPDATA%\YapCord`. The standalone installer does not migrate, read, or remove the regular YapCord/Yapper profile.

The source includes the Electron app, multiple native windows, 107 renderer plugins, offline opt-in AutoCorrect with local custom typo pairs, local diagnostics, the NSIS installer, and the Windows updater. The updater accepts only published stable releases whose Ed25519-signed manifest matches the app, version, tag, channel, installer name, size, and SHA-256 digest. It downloads in the background when enabled, but only installs after the user chooses **Install and restart**.

## Build the Windows installer

The helper reuses the supplied Windows/Electron runtime, replaces its app archive with the current source, and wraps that staged payload in the NSIS installer. It does not execute or modify the supplied base installer.

On Linux/WSL with Node.js/npm, 7-Zip (`7z`), and NSIS (`makensis`):

```bash
npm ci
npm run build:win-installer -- /path/to/YapCord-base-installer.exe
```

The default output is `YapCord1.0.exe` in the repository root. You can pass a second output path. The installer is not Authenticode-signed, so Windows may show a publisher warning. The updater uses the installer’s silent `/S` mode.

## First signed stable release

Use a stable version greater than the running app version. The version must match `package.json`, the Git tag, and the signed manifest.

1. Build and test `YapCord1.0.exe`.
2. Push the matching `vMAJOR.MINOR.PATCH` tag. The tag workflow creates a draft only.
3. Upload the installer to the draft with the exact asset name `YapCord1.0.exe`.
4. Run **Verify YapCord update-signing key** from `main`. It checks the `update-signing` environment-scoped secret without printing it.
5. Run **Sign YapCord update manifest** from `main` with the draft tag. This rejects non-draft releases and pre-existing signed assets, signs the manifest, and verifies the assets again after downloading them from GitHub.
6. Review `YapCord1.0.exe`, `update.json`, and `update.json.sig` in the draft. Then run **Publish verified YapCord release** with the same tag. That separate workflow verifies the files again before publication.

The private key belongs only in the GitHub Actions environment; the app contains only the public verification key. That environment currently has no required-reviewer rule. If signing should require an additional approval, configure required reviewers in GitHub before using it. After a release is public, publish a new higher version rather than replacing signed assets.
