#!/bin/zsh

# This helper is deliberately opened by Terminal. Spotlight-launched Shortcuts
# and applets may not have permission to read repositories inside Documents,
# while Terminal retains the user's normal local-file access.

set -u

readonly DEFAULT_LAUNCHER="$HOME/Documents/Personal Excalidraw/scripts/launch-personal-excalidraw.sh"
readonly HELPER_LOG="$HOME/Library/Logs/Excalidraw Local Spotlight.log"

find_launcher() {
  local launcher=""

  if [[ -f "$DEFAULT_LAUNCHER" ]]; then
    print -r -- "$DEFAULT_LAUNCHER"
    return 0
  fi

  launcher="$(
    /usr/bin/mdfind -onlyin "$HOME" \
      'kMDItemFSName == "launch-personal-excalidraw.sh"c' 2>/dev/null |
      /usr/bin/grep '/scripts/launch-personal-excalidraw\.sh$' |
      /usr/bin/head -n 1
  )"

  if [[ -n "$launcher" && -f "$launcher" ]]; then
    print -r -- "$launcher"
    return 0
  fi

  return 1
}

main() {
  local launcher=""

  launcher="$(find_launcher || true)"
  if [[ -z "$launcher" ]]; then
    /usr/bin/osascript <<'APPLESCRIPT'
display alert "Excalidraw Local could not start" message "The repository launcher could not be found. Run scripts/install-personal-excalidraw-spotlight-app.sh again from the cloned repository." as critical
APPLESCRIPT
    return 1
  fi

  /bin/mkdir -p "$HOME/Library/Logs"

  # Detach immediately so Spotlight and Terminal do not remain busy while Vite
  # starts. The repository launcher performs readiness checks and opens the URL.
  /usr/bin/nohup /bin/zsh "$launcher" >>"$HELPER_LOG" 2>&1 </dev/null &
}

main "$@"
