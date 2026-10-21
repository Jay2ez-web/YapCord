# YapCord

YapCord is a desktop client built on Yapper. The standalone Windows app is branded **YapCord**; the current release is **YapCord 1.1** (version `1.1.0`). The installer keeps the existing `YapCord1.0` install/profile paths so upgrades preserve the existing app data.

## Profiles and included features

The standalone installer keeps settings, themes, logs, and the login session in `%APPDATA%\YapCord1.0`. The optional in-Yapper integration keeps its separate profile in `%APPDATA%\YapCord`. The standalone installer does not migrate, read, or remove the regular YapCord/Yapper profile.

The source includes the Electron app, multiple native windows, 110 renderer plugins, offline opt-in AutoCorrect with local custom typo pairs, local diagnostics, the NSIS installer, and the Windows updater. The updater accepts only published stable releases whose Ed25519-signed manifest matches the app, version, tag, channel, installer name, size, and SHA-256 digest. It downloads in the background when enabled, but only installs after the user chooses **Install and restart**.

### Suggested plugin adaptations

The current source adds **SplitLargeMessages** (breaks long text at line/word boundaries and sends the remaining chunks sequentially), **Quoter** (creates a local YapCord-branded PNG quote card from a message), and **MoreUserTags** (shows role-derived owner/admin/staff/moderator labels in message headers). These are local adaptations inspired by [Equicord](https://github.com/Equicord/Equicord), whose project is GPL-3.0-or-later; the YapCord implementations target Yapper's APIs and do not copy the upstream plugin modules verbatim. SplitLargeMessages uses a configurable delay and does not bypass server slowmode or rate limits. Quoter does not fetch remote fonts or avatars.

The other suggestions are not represented as working features because their source requirements are not available in Yapper: CustomRPC and PlatformIndicators rely on Discord-only activity/session stores, BannersEverywhere requires profile-banner data not exposed by the inspected Yapper profile model, and FriendshipRanks needs a friend-since timestamp that the loaded relationship map does not provide. ReviewDB would transmit account/review data to a separate third-party service and requires its own OAuth flow, so it is not enabled without a separate explicit service/data-sharing decision. Existing YapCord **FriendTags**, **PermissionsViewer**, and **ServerListIndicators** remain unchanged; the new role labels complement rather than replace the manual private friend tags or permission viewer.

## Build the Windows installer

The helper reuses the supplied Windows/Electron runtime, replaces its app archive with the current source, embeds the supplied YapCord icon in the installed `YapCord.exe`, and wraps that staged payload in the NSIS installer. The same branding is used for the setup EXE, shortcuts, app window, and tray. It does not execute or modify the supplied base installer.

On Linux/WSL with Node.js/npm, 7-Zip (`7z`), NSIS (`makensis`), and Wine (used by the Windows executable resource editor):

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
