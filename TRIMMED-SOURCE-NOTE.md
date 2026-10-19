# Trimmed source copy

Contains 59 plugins, including offline AutoCorrect, the read-only ShowHiddenChannels directory, local-only FriendTags, and copy-only ProfileSets. FriendTags stores custom tags in YapCord settings and adds them to currently rendered friend/member rows for text search with `&tag`; it makes no API calls or account changes. ProfileSets stores display-name/bio templates locally and only copies values for manual use; it does not update the account.

FriendCodes, FriendInvites, FriendshipRanks, and a server-copy feature are not included: the documented Yapper API does not provide those normal-user friend operations or friendship start dates; a full server clone would require role-creation support that the bot API does not document. Obsolete v2/v3/v4 SFX installer recipes, probe and CDP diagnostics, and the incomplete Message Bookmarks plugin were removed. The patcher and rebuild lists match the plugin files.

The Windows installer is named `YapCord1.0.exe`; its installer name is YapCord 1.0 and the installed app is YapCord. It installs separately under `%LOCALAPPDATA%\\YapCord1.0` and stores its settings/login under `%APPDATA%\\YapCord1.0`, without sharing the normal `%APPDATA%\\YapCord` profile. It uses the uploaded YapCord 0.65.6 base and is unsigned.

YapCord 1.0 app-level additions: one-time first-run setup, multiple native windows, and an on-device performance/add-ons panel. A public GitHub repository now contains this maintained source and a draft-release workflow. The workflow does not publish binaries; no update client, feed, or signed release is configured.
