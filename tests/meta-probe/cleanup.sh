#!/usr/bin/env bash
# Undo prep.sh: return to WS1, disable probe, restore forge/rivals.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
UUID_PROBE="meta-probe@forge-test.local"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/forge-meta-probe"
STATE_FILE="$STATE_DIR/prep-state.json"
# Human WS1 = 0-based index 0 (operator desk / Guake)
RETURN_WS_INDEX="${META_PROBE_RETURN_WS:-0}"

log() { printf 'meta-probe cleanup: %s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

need_cmd gnome-extensions
need_cmd python3

# --- return to operator workspace BEFORE disabling probe (needs DBus) ---
if python3 "$ROOT/probe_driver.py" ping >/dev/null 2>&1; then
  log "focus workspace index $RETURN_WS_INDEX (human WS$((RETURN_WS_INDEX + 1)))"
  python3 "$ROOT/probe_driver.py" focus-workspace "$RETURN_WS_INDEX" >/dev/null 2>&1 \
    || log "warn: FocusWorkspace $RETURN_WS_INDEX failed (continuing cleanup)"
  sleep 0.3
else
  log "probe DBus down — skip workspace return (switch to WS1 manually if needed)"
fi

# Always try to disable probe next
if gnome-extensions info "$UUID_PROBE" >/dev/null 2>&1; then
  log "disable $UUID_PROBE"
  gnome-extensions disable "$UUID_PROBE" 2>/dev/null || true
fi

if [[ ! -f "$STATE_FILE" ]]; then
  log "no state file ($STATE_FILE) — re-enable forge only (best effort)"
  gnome-extensions enable forge@jmmaranan.com 2>/dev/null || true
  log "done (partial)"
  exit 0
fi

log "restoring from $STATE_FILE"
python3 - "$STATE_FILE" <<'PY'
import json, subprocess, sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text())
exts = data.get("extensions") or {}
probe = "meta-probe@forge-test.local"

def run(args):
    return subprocess.run(args, capture_output=True, text=True)

for uuid, prev in exts.items():
    if uuid == probe:
        # leave disabled after cleanup
        r = run(["gnome-extensions", "disable", uuid])
        print(f"  probe → disabled ({r.returncode})", file=sys.stderr)
        continue
    if prev == "enabled":
        r = run(["gnome-extensions", "enable", uuid])
        print(f"  enable {uuid} (was enabled) rc={r.returncode}", file=sys.stderr)
    elif prev == "disabled":
        r = run(["gnome-extensions", "disable", uuid])
        print(f"  keep disabled {uuid} rc={r.returncode}", file=sys.stderr)
    else:
        print(f"  skip {uuid} (was {prev})", file=sys.stderr)

print("restore complete", file=sys.stderr)
PY

# archive state so re-prep records fresh
mv -f "$STATE_FILE" "$STATE_FILE.restored-$(date -u +%Y%m%dT%H%M%SZ)" 2>/dev/null || rm -f "$STATE_FILE"
log "OK — workspace → index $RETURN_WS_INDEX (WS$((RETURN_WS_INDEX + 1))); tilers restored; probe off"
