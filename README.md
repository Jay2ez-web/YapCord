# YapCord 1.0 — source and release scaffolding

Adds these plugins to your YapCord desktop client (tested against YapCord 0.65.6,
the Electron wrapper that loads `https://www.yapper.website/`):

| Plugin | What it does |
|---|---|
| **AlwaysAnimate** | Forces animated avatars / emojis / effects to play past reduce-motion and background throttling. Spoofs `prefers-reduced-motion`, unpauses CSS, re-requests animated avatar URLs. |
| **AutoCorrect** | Corrects a curated list of common English typos in the chat composer when you type a space or punctuation. Offline; supports custom typo=replacement pairs. |
| **AlwaysTrust** | Auto-clicks trust / confirm dialogs after a short delay. Destructive categories (payments, deletion, password changes) are **OFF by default** — enable each explicitly. Server-side checks still apply. |
| **ForceOwnerCrown** | Client-side 👑 next to **your own** name in messages, member list, profile popouts, and voice tiles. Only you see it; it grants no permissions. |
| **ScheduleMessages** | 🕐 button next to the composer, date/time picker, send loop every 10s, panel above the composer with cancel/edit. Survives reloads via localStorage. |
| **AutoIdleOnAFK** | Sets you idle after N minutes (default 5) without input, restores your prior status on activity. Tries Yapper's presence action, then store fields, then a `💤` title fallback. |
| **AutoTranslate** | Inline translation below foreign messages, 🌐 button per message (Shift+RightClick also works), target-language select, per-user ignore list, localStorage cache (Google gtx + MyMemory fallback). |
| **CustomFontFiles** (v3+) | Import .ttf/.otf/.woff/.woff2 files from disk (Settings panel or the Aa button by the composer), stored in IndexedDB, pick the active font, size + app-wide/chat-only toggle. |
| **FriendTags** | Store private local tags for friends; tag text on currently rendered member/friend rows can be searched in the existing quick switcher with `&tag`. No API calls or account actions. |
| **ProfileSets** | Save local display-name/bio templates and copy values for manual use. It does not edit your Yapper account. |
| **ShowHiddenChannels** | Read-only directory of channel names, categories, and basic flags already present in the app's local state. No API calls, message access, or channel navigation. |

Files:

- `yapper-plugins/*.js` — 59 custom plugins; supplied plugin defaults are off for new installs.
- `renderer-core/` — compatibility, modal, settings, native bridge, and first-run setup renderer files.
- `electron-core/` — reviewed Electron main, IPC, and preload sources for multi-window support and local performance metrics.
- `tools/patch-yapcord.py` — optional plugin patcher for a compatible existing YapCord 0.65.x install; it is not the standalone installer builder.
- Obsolete v7 build scripts, personal-machine paths, installer stubs, and the incomplete Bookmarks plugin are deliberately excluded from this public repository.

## YapCord 1.0 installer

A side-by-side installer was built as `YapCord1.0.exe`, but the executable is not
included in this repository. The installer identifies itself
as **YapCord 1.0**; the installed executable, app name, and shortcuts are **YapCord**.
It installs per-user under `%LOCALAPPDATA%\\YapCord1.0` and keeps its login/settings
profile under `%APPDATA%\\YapCord1.0`, separate from the standard `%APPDATA%\\YapCord`
profile. This avoids sharing data with another YapCord install. The installer is unsigned.

`renderer-core/090-settings-ui.js` supplies the YapCord Plugins page styling,
categories, search, On/Off filter, and options popups. The optional plugin patcher is
separate from the standalone installer build process.

The app's product name in its package metadata is **YapCord**.

## Install

1. Close YapCord completely (tray → Quit).
2. Review `yapper-plugins/*.js` so you know what each plugin clicks, sends, or changes as you type.
3. Open an **Administrator** terminal in this folder and run:
   - `python tools\patch-yapcord.py`
4. Reopen YapCord → Settings → Plugins → enable the new entries (all new ports are OFF by default).
5. YapCord updates will overwrite `app.asar` — re-run the script after each update. New plugin defaults are OFF; existing saved choices are not reset.

## Restore

- `python tools\patch-yapcord.py --restore` copies `app.asar.bak` back. Then restart YapCord.

## Safety notes (read before enabling)

- **AlwaysTrust does not bypass servers.** It only clicks the same on-screen buttons you could click. Leave `skipPayments`, `skipDeletion`, `skipPasswordChanges` OFF unless you accept that a dialog can be confirmed while you're away. The `delayMs` option (default 800ms) exists so you can see the click happen.
- **ForceOwnerCrown is cosmetic.** Other users see your real badges.
- **ScheduleMessages needs YapCord running** at send time — it is a client-side loop, not a server cron. Messages scheduled while the app is closed send late on next tick (retries 60×, then dropped with a toast).
- **AutoTranslate** sends message text to Google Translate / MyMemory over HTTPS. Don't use it in confidential channels.
- Patching `C:\Program Files\YapCord\resources\app.asar` requires elevation and breaks the installer's file hash — that is expected for asar mods and is why the script keeps `app.asar.bak`.

## Ports from YapCord 1.9.0 (v6-190feat)

The 1.9.0 core APIs (`YM.dom/store/messages/media/finder/...`) are byte-identical
to our 0.65.6 base, so its plugins run unmodified. Ported (all OFF by default):
AccentColor, BiggerStreamPreview, CopyEmojiMarkdown, CustomCommands, CustomFont,
CustomRingtone, CustomServerIcons, FriendNicknames, HideBadges, HideClutter,
ImageFilename, KeepCurrentChannel, MentionAvatars (replaces our partial
`Ported_mentionAvatars` shim), MessageStyle, MoreQuickReactions, NameEffects,
NameStyle, NoMosaic, NoPendingCount, NoServerEmojis, PermissionsViewer,
PlainFolderIcon, PreviewMessage, QuickDelete, RelationshipNotifier, ReplyPingDot,
RoleColorEverywhere, RoundedCorners, ServerAccent, ServerInfo, ServerListIndicators,
ShikiCodeblocks, SmoothTransitions, TypingTweaks, UserVoiceShow, VcNarrator,
VoiceChatDoubleClick, VoiceDownload, WordFilter, oneko.

Deliberately skipped: **ReadAllNotificationsButton** (unwanted), **BackgroundImage**
(Settings → Wallpaper already does this and more), **ScheduleMessage** (our
ScheduleMessages is a superset: cancel/edit, configurable loop).

Not implemented: automatic updates/rollback, Backup/Restore, or stable/beta/preview
update feeds.

## Source and build notes

The source tree contains the YapCord-specific renderer plugins and app-level main/preload changes, not the full base application payload. The standalone installer is not included. Do not treat the optional `patch-yapcord.py` script as a release build; it only installs renderer plugins into a compatible existing app and keeps a backup.

## YapCord 1.0 app-level features

The side-by-side `YapCord1.0.exe` build also includes three app-level additions: a one-time first-run setup wizard (appearance, optional notification permission, shortcuts), multiple native windows (`Ctrl/Cmd+Shift+N`), and a local Performance panel under YapCord Settings → App showing Electron process working-set memory, sampled CPU, and enabled add-ons. These settings and metrics stay on the device. The modified Electron sources are in `electron-core/`; renderer changes are in `renderer-core/`.

The GitHub workflow in `.github/workflows/draft-release.yml` creates a **draft release only** when a `v*` tag is pushed. It does not build or upload an installer, publish a release, or provide an update feed. Automatic updates remain off until an updater client and a trusted signed-update process are implemented. The current installer is unsigned and is not included here.
