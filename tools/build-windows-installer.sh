#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <base-YapCord-installer.exe> [output.exe]" >&2
  echo "Requires 7z, makensis, npm dependencies, and the @electron/asar CLI." >&2
  exit 2
}

[[ $# -ge 1 && $# -le 2 ]] || usage
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="$(realpath -- "$1")"
OUTPUT="${2:-$ROOT/YapCord1.0.exe}"
ASAR="${ASAR_CLI:-$ROOT/node_modules/.bin/asar}"

for tool in 7z makensis; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 1; }
done
[[ -f "$BASE" ]] || { echo "Base installer not found: $BASE" >&2; exit 1; }
[[ -x "$ASAR" ]] || { echo "ASAR CLI not found at $ASAR; run npm ci first." >&2; exit 1; }
[[ -f "$ROOT/build/yapcord.ico" && -f "$ROOT/build/icon.png" ]] || {
  echo "Missing YapCord branding assets in build/." >&2
  exit 1
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/yapcord-installer.XXXXXX")"
trap 'rm -rf -- "$TMP"' EXIT
if [[ "$(uname -s)" == Linux ]] && ! command -v wine64 >/dev/null 2>&1; then
  WINE_BIN="$(command -v wine || true)"
  if [[ -n "$WINE_BIN" ]]; then
    mkdir -p "$TMP/wine-bin"
    ln -s "$WINE_BIN" "$TMP/wine-bin/wine64"
    export PATH="$TMP/wine-bin:$PATH"
  else
    echo "Wine is unavailable; preserving the icon already embedded in the supplied Windows runtime." >&2
  fi
fi
PAYLOAD="$TMP/payload"
APP="$TMP/app"
VERIFY="$TMP/verify"
mkdir -p "$PAYLOAD" "$APP/build"

# Reuse the supplied Windows/Electron runtime, but exclude NSIS's temporary installer plugins.
7z x -y "$BASE" "-o$PAYLOAD" '-x!$PLUGINSDIR/*' >/dev/null
[[ -f "$PAYLOAD/YapCord.exe" && -d "$PAYLOAD/resources" ]] || {
  echo "The base file is not a supported YapCord Windows installer." >&2
  exit 1
}

cp "$ROOT/package.json" "$APP/package.json"
cp -a "$ROOT/src" "$ROOT/themes" "$APP/"
cp "$ROOT/build/icon.png" "$APP/build/icon.png"
if command -v wine64 >/dev/null 2>&1 || command -v wine >/dev/null 2>&1; then
  node "$ROOT/tools/set-exe-icon.js" "$PAYLOAD/YapCord.exe" "$ROOT/build/yapcord.ico"
fi
"$ASAR" pack "$APP" "$PAYLOAD/resources/app.asar"
"$ASAR" extract "$PAYLOAD/resources/app.asar" "$VERIFY"

# Confirm the packaged app archive contains the current source, not the source from the base installer.
for file in \
  package.json \
  src/main/index.js \
  src/main/settings.js \
  src/main/inject.js \
  src/main/updater.js \
  src/main/update-protocol.js \
  src/main/update-public.pem \
  src/main/datadir.js \
  src/renderer/090-settings-ui.js \
  src/renderer/060-messages.js \
  src/renderer/091-custom-badge.js \
  build/icon.png \
  src/renderer/plugins/AlwaysAnimate.js \
  src/renderer/plugins/BetterFolders.js \
  src/renderer/plugins/ForceOwnerCrown.js \
  src/renderer/plugins/CustomFontFiles.js; do
  cmp -s "$ROOT/$file" "$VERIFY/$file" || { echo "Packaged source mismatch: $file" >&2; exit 1; }
done

mkdir -p "$(dirname -- "$OUTPUT")"
APP_VERSION="$(node -p "require('$ROOT/package.json').version")"
(cd "$ROOT" && makensis -DPRODUCT_VERSION="$APP_VERSION" -DPAYLOAD_DIR="$PAYLOAD" -DOUTPUT_FILE="$OUTPUT" "$ROOT/tools/installer.nsi")
[[ -s "$OUTPUT" ]] || { echo "NSIS did not create the output installer." >&2; exit 1; }
# NSIS re-encodes icon entries; restore the exact supplied icon in the setup EXE's PE resources.
if command -v wine64 >/dev/null 2>&1 || command -v wine >/dev/null 2>&1; then
  node "$ROOT/tools/set-exe-icon.js" "$OUTPUT" "$ROOT/build/yapcord.ico" --icon-only
fi
printf 'Created: %s\n' "$OUTPUT"
printf 'Size: %s bytes\n' "$(stat -c '%s' "$OUTPUT")"
sha256sum "$OUTPUT"
