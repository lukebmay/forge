#!/usr/bin/env bash
# Prepare session for Meta probe runs: install probe, disable tilers, enable probe.
# Safe to re-run. Writes state for cleanup.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
UUID_PROBE="meta-probe@forge-test.local"
UUID_FORGE="forge@jmmaranan.com"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/forge-meta-probe"
STATE_FILE="$STATE_DIR/prep-state.json"
RIVALS_FILE="$ROOT/rivals.txt"
HOST_LABEL="${1:-}"

log() { printf 'meta-probe prep: %s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

# GNOME 45+ reports "Enabled: Yes|No" and "State: ACTIVE|INACTIVE".
# Older wording used State: ENABLED|DISABLED. Never match only "state:.*enabled"
# — that misses ACTIVE and left Forge running during pilot.
ext_state() {
  # prints enabled|disabled|missing
  local uuid="$1" out
  if ! out="$(gnome-extensions info "$uuid" 2>/dev/null)"; then
    echo missing
    return
  fi
  if echo "$out" | grep -qiE '^[[:space:]]*Enabled:[[:space:]]*Yes\b'; then
    echo enabled
    return
  fi
  if echo "$out" | grep -qiE '^[[:space:]]*Enabled:[[:space:]]*No\b'; then
    echo disabled
    return
  fi
  if echo "$out" | grep -qiE '^[[:space:]]*State:[[:space:]]*(ACTIVE|ENABLED)\b'; then
    echo enabled
    return
  fi
  if echo "$out" | grep -qiE '^[[:space:]]*State:[[:space:]]*(INACTIVE|DISABLED)\b'; then
    echo disabled
    return
  fi
  # last resort
  if gnome-extensions list --enabled 2>/dev/null | grep -qxF "$uuid"; then
    echo enabled
  else
    echo disabled
  fi
}

is_enabled_live() {
  # Prefer list --enabled (matches Shell enablement list) + info Enabled/State
  local uuid="$1"
  if gnome-extensions list --enabled 2>/dev/null | grep -qxF "$uuid"; then
    return 0
  fi
  [[ "$(ext_state "$uuid")" == enabled ]]
}

disable_uuid() {
  local uuid="$1" attempt st
  for attempt in 1 2 3 4 5; do
    if ! is_enabled_live "$uuid"; then
      return 0
    fi
    log "disable $uuid (attempt $attempt)"
    gnome-extensions disable "$uuid" 2>/dev/null || true
    sleep 0.35
  done
  if is_enabled_live "$uuid"; then
    log "warn: still enabled after retries: $uuid"
    return 1
  fi
  return 0
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
  log "recorded: $UUID_FORGE=$(ext_state "$UUID_FORGE") (must be enabled if it was on at session start)"
fi

# --- disable forge + rivals (always attempt live-enabled set) ---
fail_disable=0
while IFS= read -r uuid || [[ -n "$uuid" ]]; do
  [[ -z "$uuid" || "$uuid" =~ ^# ]] && continue
  if is_enabled_live "$uuid"; then
    disable_uuid "$uuid" || fail_disable=1
  fi
done <"$RIVALS_FILE"

# Belt-and-suspenders: anything still on list --enabled that is a rival
while IFS= read -r uuid || [[ -n "$uuid" ]]; do
  [[ -z "$uuid" || "$uuid" =~ ^# ]] && continue
  if gnome-extensions list --enabled 2>/dev/null | grep -qxF "$uuid"; then
    log "force-disable still-listed $uuid"
    disable_uuid "$uuid" || fail_disable=1
  fi
done <"$RIVALS_FILE"

if is_enabled_live "$UUID_FORGE"; then
  die "Forge still enabled after prep — cannot measure cleanly"
fi
if [[ $fail_disable -ne 0 ]]; then
  log "warn: some rival disable retries failed; preflight will re-check"
fi

# --- enable probe ---
st="$(ext_state "$UUID_PROBE")"
if [[ "$st" == missing ]]; then
  log "probe not visible to gnome-extensions yet (need Wayland logout/login once after install)"
  log "after login, re-run: $ROOT/prep.sh"
  die "probe extension not loaded in this session"
fi

if ! is_enabled_live "$UUID_PROBE"; then
  log "enable $UUID_PROBE"
  gnome-extensions enable "$UUID_PROBE" || die "failed to enable probe"
  sleep 0.5
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

# Confirm CLI parser agrees (regression guard for Enabled/State bug)
python3 - "$ROOT" "$UUID_FORGE" "$UUID_PROBE" <<'PY' || die "extension_enabled regression"
import sys
from pathlib import Path

root = Path(sys.argv[1])
sys.path.insert(0, str(root))
from probe_driver import extension_enabled

forge_on = extension_enabled(sys.argv[2])
probe_on = extension_enabled(sys.argv[3])
print(f"cli forge_enabled={forge_on} probe_enabled={probe_on}", file=sys.stderr)
if forge_on is True:
    raise SystemExit("forge still reports enabled")
if probe_on is not True:
    raise SystemExit("probe does not report enabled")
PY

log "OK — ready for pilot/run. Cleanup later: $ROOT/cleanup.sh"
echo "$STATE_FILE"
