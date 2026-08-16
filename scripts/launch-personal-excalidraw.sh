#!/bin/zsh

# Spotlight launcher for this specific Excalidraw checkout.
#
# The launcher deliberately avoids the common development ports (3000/3001).
# If its preferred port is busy, it selects and remembers another free port.

set -u

readonly USER_HOME_DIR="$HOME"
export PATH="$USER_HOME_DIR/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

readonly SCRIPT_DIR="${0:A:h}"
readonly PROJECT_DIR="${SCRIPT_DIR:h}"
readonly APP_DIR="$PROJECT_DIR/excalidraw-app"
readonly STATE_DIR="$USER_HOME_DIR/Library/Application Support/Excalidraw Local"
readonly PORT_FILE="$STATE_DIR/port"
readonly LOG_FILE="$USER_HOME_DIR/Library/Logs/Excalidraw Local.log"
readonly PREFERRED_PORT=43127
readonly PORT_RANGE_END=43227

# Used by automated verification so a test does not focus or open a browser.
readonly NO_OPEN="${EXCALIDRAW_LAUNCHER_NO_OPEN:-0}"

show_error() {
  local message="$1"

  /usr/bin/osascript - "$message" <<'APPLESCRIPT'
on run argv
  display alert "Excalidraw Local could not start" message (item 1 of argv) as critical
end run
APPLESCRIPT
}

is_valid_port() {
  local port="$1"

  [[ "$port" == <-> ]] && (( port >= 1024 && port <= 65535 ))
}

port_is_free() {
  local port="$1"

  ! /usr/sbin/lsof -nP "-iTCP:$port" -sTCP:LISTEN >/dev/null 2>&1
}

project_cwd_for_pid() {
  local pid="$1"

  /usr/sbin/lsof -a -p "$pid" -d cwd -Fn 2>/dev/null |
    /usr/bin/sed -n 's/^n//p' |
    /usr/bin/head -n 1
}

listening_port_for_pid() {
  local pid="$1"

  /usr/sbin/lsof -nP -a -p "$pid" -iTCP -sTCP:LISTEN -Fn 2>/dev/null |
    /usr/bin/sed -n 's/^n.*:\([0-9][0-9]*\)$/\1/p' |
    /usr/bin/head -n 1
}

listener_belongs_to_project() {
  local port="$1"
  local pid

  for pid in $(/usr/sbin/lsof -nP "-iTCP:$port" -sTCP:LISTEN -t 2>/dev/null); do
    if [[ "$(project_cwd_for_pid "$pid")" == "$APP_DIR" ]]; then
      return 0
    fi
  done

  return 1
}

find_running_project_port() {
  local remembered_port=""
  local pid
  local port

  if [[ -r "$PORT_FILE" ]]; then
    remembered_port="$(<"$PORT_FILE")"
    if is_valid_port "$remembered_port" &&
      listener_belongs_to_project "$remembered_port"; then
      print -r -- "$remembered_port"
      return 0
    fi
  fi

  # Recover even when the state file was removed or the server was started
  # manually on a different port.
  for pid in $(/usr/sbin/lsof -nP -iTCP -sTCP:LISTEN -t 2>/dev/null |
    /usr/bin/sort -u); do
    if [[ "$(project_cwd_for_pid "$pid")" != "$APP_DIR" ]]; then
      continue
    fi

    port="$(listening_port_for_pid "$pid")"
    if is_valid_port "$port"; then
      print -r -- "$port"
      return 0
    fi
  done

  return 1
}

is_excalidraw_ready() {
  local port="$1"

  listener_belongs_to_project "$port" &&
    /usr/bin/curl -fsS --max-time 2 "http://localhost:$port/" 2>/dev/null |
      /usr/bin/grep -q '<title>Excalidraw Whiteboard</title>'
}

choose_free_port() {
  local remembered_port=""
  local port

  # Preserve the browser origin whenever possible. Excalidraw browser data is
  # tied to the hostname and port, so the remembered port gets first priority.
  if [[ -r "$PORT_FILE" ]]; then
    remembered_port="$(<"$PORT_FILE")"
    if is_valid_port "$remembered_port" && port_is_free "$remembered_port"; then
      print -r -- "$remembered_port"
      return 0
    fi
  fi

  for ((port = PREFERRED_PORT; port <= PORT_RANGE_END; port++)); do
    if port_is_free "$port"; then
      print -r -- "$port"
      return 0
    fi
  done

  # The dedicated range being completely occupied is extremely unlikely.
  # Ask macOS for an available loopback port as a final fallback.
  /usr/bin/python3 - <<'PYTHON'
import socket

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PYTHON
}

remember_port() {
  local port="$1"

  /bin/mkdir -p "$STATE_DIR"
  print -r -- "$port" >"$PORT_FILE"
}

open_excalidraw() {
  local port="$1"
  local url="http://localhost:$port"

  if [[ "$NO_OPEN" == "1" ]]; then
    print -r -- "$url"
  else
    /usr/bin/open "$url"
  fi
}

wait_for_excalidraw() {
  local port="$1"
  local attempts="$2"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if is_excalidraw_ready "$port"; then
      return 0
    fi

    /bin/sleep 0.5
  done

  return 1
}

main() {
  local running_port=""
  local selected_port=""

  if [[ ! -d "$APP_DIR" ]]; then
    show_error "The project directory is missing: $APP_DIR"
    return 1
  fi

  running_port="$(find_running_project_port || true)"
  if is_valid_port "$running_port"; then
    # A second Spotlight invocation may arrive while the first one is still
    # starting. Wait for that process instead of launching a duplicate.
    if wait_for_excalidraw "$running_port" 60; then
      # Adopt manually started instances too. Remembering their port preserves
      # the browser origin and therefore the existing local Excalidraw data.
      remember_port "$running_port"
      open_excalidraw "$running_port"
      return 0
    fi
  fi

  selected_port="$(choose_free_port)"
  if ! is_valid_port "$selected_port"; then
    show_error "macOS could not allocate a free local port."
    return 1
  fi

  /bin/mkdir -p "$STATE_DIR" "$USER_HOME_DIR/Library/Logs"

  local corepack_bin=""
  corepack_bin="$(command -v corepack || true)"
  if [[ -z "$corepack_bin" ]]; then
    show_error "Corepack is missing. Install Node.js 18 or newer, then try again."
    return 1
  fi

  {
    print -r -- ""
    print -r -- "[$(/bin/date '+%Y-%m-%d %H:%M:%S')] Starting on port $selected_port"
  } >>"$LOG_FILE"

  # Vite's config normally opens a browser itself. BROWSER=none makes this
  # launcher the single owner of that action, preventing duplicate tabs.
  BROWSER=none /usr/bin/nohup "$corepack_bin" yarn \
    --cwd "$APP_DIR" vite \
    --host localhost \
    --port "$selected_port" \
    --strictPort \
    >>"$LOG_FILE" 2>&1 </dev/null &

  if wait_for_excalidraw "$selected_port" 120; then
    remember_port "$selected_port"
    open_excalidraw "$selected_port"
    return 0
  fi

  show_error "The free-port check succeeded, but Excalidraw did not become ready. Review $LOG_FILE."
  return 1
}

main "$@"
