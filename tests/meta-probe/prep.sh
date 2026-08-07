#!/usr/bin/env bash
# Prepare session for Meta probe runs: install probe, disable tilers, enable probe.
# Safe to re-run. Writes state for cleanup.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
UUID_PROBE="meta-probe@forge-test.local"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/forge-meta-probe"
STATE_FILE="$STATE_DIR/prep-state.json"
RIVALS_FILE="$ROOT/rivals.txt"
HOST_LABEL="${1:-}"

log() { printf 'meta-probe prep: %s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

ext_state() {
  # prints enabled|disabled|missing
  local uuid="$1" out
  if ! out="$(gnome-extensions info "$uuid" 2>/dev/null)"; then
    echo missing
    return
  fi
  if echo "$out" | grep -qi 'state:.*enabled'; then
    echo enabled
  else
    echo disabled
  fi
}

need_cmd gnome-extensions
need_cmd gdbus
need_cmd python3
need_cmd ln

mkdir -p "$STATE_DIR"

# --- install probe symlink ---
"$ROOT/install-probe.sh" >/dev/null

# --- record previous states (only first prep in a session keeps original) ---
if [[ -f "$STATE_FILE" ]]; then
  log "state file exists ($STATE_FILE) — updating live actions only; original restore set kept"
else
  log "recording extension states → $STATE_FILE"
  {
    echo '{'
    echo "  \"createdAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"host\": \"${HOST_LABEL:-$(hostname -s)}\","
    echo "  \"sessionType\": \"${XDG_SESSION_TYPE:-}\","
    echo '  "extensions": {'
    first=1
    while IFS= read -r uuid || [[ -n "$uuid" ]]; do
      [[ -z "$uuid" || "$uuid" =~ ^# ]] && continue
      st="$(ext_state "$uuid")"
      if [[ $first -eq 0 ]]; then echo ','; fi
      first=0
      printf '    "%s": "%s"' "$uuid" "$st"
    done <"$RIVALS_FILE"
    # always record probe
    echo ','
    printf '    "%s": "%s"\n' "$UUID_PROBE" "$(ext_state "$UUID_PROBE")"
    echo '  }'
    echo '}'
  } >"$STATE_FILE"
fi

# --- disable forge + rivals ---
while IFS= read -r uuid || [[ -n "$uuid" ]]; do
  [[ -z "$uuid" || "$uuid" =~ ^# ]] && continue
  st="$(ext_state "$uuid")"
  if [[ "$st" == enabled ]]; then
    log "disable $uuid"
    gnome-extensions disable "$uuid" || log "warn: disable failed: $uuid"
  fi
done <"$RIVALS_FILE"

# --- enable probe ---
st="$(ext_state "$UUID_PROBE")"
if [[ "$st" == missing ]]; then
  log "probe not visible to gnome-extensions yet (need Wayland logout/login once after install)"
  log "after login, re-run: $ROOT/prep.sh"
  die "probe extension not loaded in this session"
fi

if [[ "$st" != enabled ]]; then
  log "enable $UUID_PROBE"
  gnome-extensions enable "$UUID_PROBE" || die "failed to enable probe"
fi

# --- wait for DBus ---
log "waiting for MetaProbe DBus…"
ok=0
for i in $(seq 1 40); do
  if python3 "$ROOT/probe_driver.py" ping >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 0.25
done
[[ $ok -eq 1 ]] || die "probe DBus not up after enable (try logout if first install)"

log "preflight…"
python3 "$ROOT/probe_driver.py" preflight ${HOST_LABEL:+--host "$HOST_LABEL"} || die "preflight failed"

log "OK — ready for pilot/run. Cleanup later: $ROOT/cleanup.sh"
echo "$STATE_FILE"
