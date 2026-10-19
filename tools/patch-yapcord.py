#!/usr/bin/env python3
"""Install (or restore) the 59 custom YapCord plugins by patching app.asar.

Usage (run as Administrator - right-click -> Run as administrator):
    python tools\\patch-yapcord.py            # install / update the 59 plugins
    python tools\\patch-yapcord.py --restore  # restore the pre-patch backup

What it does:
  1. Backs up  C:\\Program Files\\YapCord\\resources\\app.asar  ->  app.asar.bak
     (first run only; the .bak is never overwritten).
  2. Reads the asar header, injects the files from yapper-plugins/*.js
     into src/renderer/plugins/, recomputes offsets + SHA256 integrity,
     and rebuilds the archive in Chromium-pickle format.
  3. Re-reads the new archive to verify all plugins are listed.

  Core backports (025-compat.js, 068-people.js, 069-modal.js, 090-settings-ui.js) live in
  renderer-core/ and are installed into src/renderer/ by hand (see README),
  because patch-yapcord.py only handles src/renderer/plugins/.

The renderer (src/main/bundle.js) concatenates every file in src/renderer/plugins/
at startup, so no other change is needed. Restart YapCord and enable the new
plugins under Settings > Plugins.
"""
import hashlib
import json
import os
import struct
import sys
import shutil

ASAR = r"C:\Program Files\YapCord\resources\app.asar"
BAK = ASAR + ".bak"

PLUGINS = [
    "AutoCorrect.js",
    "ShowHiddenChannels.js",
    "AlwaysAnimate.js",
    "AlwaysTrust.js",
    "ForceOwnerCrown.js",
    "ScheduleMessages.js",
    "AutoIdleOnAFK.js",
    "AutoTranslate.js",
    "CustomFontFiles.js",
    # Ported from YapCord 1.9.0 (all run on the unchanged 0.65.x core APIs).
    # Skipped: ReadAllNotificationsButton (unwanted), BackgroundImage (we already
    # have wallpaper in Settings), ScheduleMessage (ours does more).
    "AccentColor.js",
    "BiggerStreamPreview.js",
    "CopyEmojiMarkdown.js",
    "CustomCommands.js",
    "CustomFont.js",
    "CustomRingtone.js",
    "CustomServerIcons.js",
    "FriendTags.js",
    "FriendNicknames.js",
    "HideBadges.js",
    "HideClutter.js",
    "ImageFilename.js",
    "KeepCurrentChannel.js",
    "MentionAvatars.js",
    "MessageStyle.js",
    "MoreQuickReactions.js",
    "NameEffects.js",
    "NameStyle.js",
    "NoMosaic.js",
    "NoPendingCount.js",
    "NoServerEmojis.js",
    "PermissionsViewer.js",
    "PlainFolderIcon.js",
    "PreviewMessage.js",
    "ProfileSets.js",
    "QuickDelete.js",
    "RelationshipNotifier.js",
    "ReplyPingDot.js",
    "RoleColorEverywhere.js",
    "RoundedCorners.js",
    "ServerAccent.js",
    "ServerInfo.js",
    "ServerListIndicators.js",
    "ShikiCodeblocks.js",
    "SmoothTransitions.js",
    "TypingTweaks.js",
    "UserVoiceShow.js",
    "VcNarrator.js",
    "VoiceChatDoubleClick.js",
    "VoiceDownload.js",
    "WordFilter.js",
    "oneko.js",
    # Rewritten 0.6 ports (native lifecycle + cleanup; replace the dead YE shims).
    "Ported_compactLayout.js",
    "Ported_focusMode.js",
    "Ported_hideAttachments.js",
    "Ported_imageZoom.js",
    "Ported_jumpToLatest.js",
    "Ported_mentionHighlight.js",
    "Ported_notificationRules.js",
    "Ported_notificationTweaks.js",
]


def script_dir():
    return os.path.dirname(os.path.abspath(__file__))


def plugins_dir():
    # tools/../yapper-plugins
    return os.path.join(os.path.dirname(script_dir()), "yapper-plugins")


def read_asar(path):
    with open(path, "rb") as f:
        sz1, sz2, sz3, sz4 = struct.unpack("<IIII", f.read(16))
        raw = f.read(sz4)
        header = json.loads(raw.decode("utf-8"))
        base = 8 + sz2
        # collect file entries in header walk order
        entries = []  # (path_parts, node)

        def walk(node, parts):
            for name, child in node.get("files", {}).items():
                if "files" in child:
                    walk(child, parts + [name])
                else:
                    entries.append((parts + [name], child))

        walk(header, [])
        f.seek(base)
        blob = f.read()
    # slice blob by offsets
    files = {}
    for parts, node in entries:
        off = int(node["offset"])
        size = int(node["size"])
        files["/".join(parts)] = blob[off:off + size]
    return header, files, (sz1, sz2, sz3, sz4)


def set_nested(header, parts, node):
    cur = header
    for p in parts[:-1]:
        nxt = cur.setdefault("files", {}).setdefault(p, {"files": {}})
        if "files" not in nxt:
            nxt["files"] = {}
        cur = nxt
    cur.setdefault("files", {})[parts[-1]] = node


def build_asar(header, files_ordered):
    """files_ordered: list of (relpath, bytes) in walk order. Recomputes offsets/integrity."""
    # rebuild header tree preserving insertion order, updating size/offset/integrity
    new_header = {"files": {}}
    offset = 0

    # group by walking the OLD header structure first so order is stable,
    # then append truly-new paths sorted.
    def walk_old(node, parts, out):
        for name, child in node.get("files", {}).items():
            if "files" in child:
                walk_old(child, parts + [name], out)
            else:
                out.append("/".join(parts + [name]))

    ordered_keys = []
    try:
        walk_old(header, [], ordered_keys)
    except Exception:
        ordered_keys = []

    data_map = dict(files_ordered)
    final_order = [k for k in ordered_keys if k in data_map]
    for k in sorted(data_map.keys()):
        if k not in final_order:
            final_order.append(k)

    for rel in final_order:
        data = data_map[rel]
        digest = hashlib.sha256(data).hexdigest()
        node = {
            "size": len(data),
            "offset": str(offset),
            "integrity": {
                "algorithm": "SHA256",
                "hash": digest,
                "blockSize": 4194304,
                "blocks": [digest],
            },
        }
        set_nested(new_header, rel.split("/"), node)
        offset += len(data)

    json_bytes = json.dumps(new_header, separators=(",", ":")).encode("utf-8")
    pad = (4 - len(json_bytes) % 4) % 4
    padded = json_bytes + b"\x00" * pad
    sz4 = len(json_bytes)
    sz3 = 4 + len(padded)
    sz2 = 8 + len(padded)
    sz1 = 4
    out = struct.pack("<IIII", sz1, sz2, sz3, sz4) + padded
    for rel in final_order:
        out += data_map[rel]
    return out, final_order


def main():
    restore = "--restore" in sys.argv
    if restore:
        if not os.path.exists(BAK):
            print("No backup found at " + BAK)
            return 1
        shutil.copy2(BAK, ASAR)
        print("Restored original app.asar from backup. Restart YapCord.")
        return 0

    if not os.path.exists(ASAR):
        print("Not found: " + ASAR)
        print("Install YapCord 0.65.x first, then re-run as Administrator.")
        return 1

    pdir = plugins_dir()
    missing = [p for p in PLUGINS if not os.path.exists(os.path.join(pdir, p))]
    if missing:
        print("Missing plugin files in " + pdir + ": " + ", ".join(missing))
        return 1

    header, files, _ = read_asar(ASAR)
    print("Read asar: %d files" % len(files))

    for name in PLUGINS:
        with open(os.path.join(pdir, name), "rb") as f:
            files["src/renderer/plugins/" + name] = f.read()
        print("  + src/renderer/plugins/%s (%d bytes)" % (name, len(files["src/renderer/plugins/" + name])))

    blob, order = build_asar(header, list(files.items()))

    if not os.path.exists(BAK):
        shutil.copy2(ASAR, BAK)
        print("Backup written: " + BAK)
    else:
        print("Backup already exists (kept): " + BAK)

    tmp = ASAR + ".tmp"
    try:
        with open(tmp, "wb") as f:
            f.write(blob)
    except PermissionError:
        print("Permission denied writing " + ASAR)
        print("Re-run this script as Administrator (right-click -> Run as administrator).")
        try:
            os.remove(tmp)
        except OSError:
            pass
        return 1
    os.replace(tmp, ASAR)
    print("Patched %s (%d bytes, %d files)" % (ASAR, len(blob), len(order)))

    # verify
    header2, files2, _ = read_asar(ASAR)
    ok = all(("src/renderer/plugins/" + p) in files2 for p in PLUGINS)
    for p in PLUGINS:
        print(("  OK " if ("src/renderer/plugins/" + p) in files2 else "  MISSING ") + p)
    if not ok:
        print("VERIFICATION FAILED - restoring backup.")
        shutil.copy2(BAK, ASAR)
        return 1
    print("Done. Restart YapCord, then enable the new plugins in Settings > Plugins.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
