#!/bin/zsh

# Compiles a small, non-sandboxed macOS app so Spotlight can reliably launch
# Personal Excalidraw without routing repository access through siriactionsd.

set -euo pipefail

readonly SCRIPT_DIR="${0:A:h}"
readonly SOURCE_SCRIPT="$SCRIPT_DIR/spotlight-app/Excalidraw Local.applescript"
readonly SOURCE_HELPER="$SCRIPT_DIR/spotlight-app/launch-personal-excalidraw.command"
readonly DESTINATION_DIR="$HOME/Applications"
readonly DESTINATION_APP="$DESTINATION_DIR/Excalidraw Local.app"

if [[ ! -f "$SOURCE_SCRIPT" || ! -f "$SOURCE_HELPER" ]]; then
  print -u2 -r -- "Launcher app source is incomplete."
  exit 1
fi

temporary_dir="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/excalidraw-spotlight.XXXXXX")"
readonly temporary_dir
readonly COMPILED_APP="$temporary_dir/Excalidraw Local.app"
trap '/bin/rm -rf "$temporary_dir"' EXIT

/bin/mkdir -p "$DESTINATION_DIR"
/usr/bin/osacompile -o "$COMPILED_APP" "$SOURCE_SCRIPT"

readonly COMPILED_PLIST="$COMPILED_APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c \
  "Add :CFBundleIdentifier string dev.soham.personal-excalidraw.launcher" \
  "$COMPILED_PLIST"
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$COMPILED_PLIST"

/bin/mkdir -p "$COMPILED_APP/Contents/Resources"
/usr/bin/ditto "$SOURCE_HELPER" \
  "$COMPILED_APP/Contents/Resources/launch-personal-excalidraw.command"
/bin/chmod +x \
  "$COMPILED_APP/Contents/Resources/launch-personal-excalidraw.command"

/usr/bin/codesign --force --deep --sign - "$COMPILED_APP"

/usr/bin/ditto "$COMPILED_APP" "$DESTINATION_APP"
/usr/bin/touch "$DESTINATION_APP"

# Register immediately instead of waiting for Spotlight's next indexing pass.
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$DESTINATION_APP"
/usr/bin/mdimport "$DESTINATION_APP" >/dev/null 2>&1 || true

print -r -- "$DESTINATION_APP"
