#!/usr/bin/env zsh
# Trigger GNOME idle → lock (and optional DPMS) for Forge blank/wake testing.
# Manual Super+Delete often does NOT reproduce overnight thrash; idle lock does.
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}trigger-idle-lock.zsh${c_reset} — force GNOME idle lock / DPMS for multi-mon testing

Why: Monitor-recovery (H1) fails on ${c_cyan}idle auto-lock + wake${c_reset}, not always on
manual lock (Super+Delete). This script temporarily shortens the idle timer
so you can reproduce without waiting an hour.

Usage:
  trigger-idle-lock.zsh [options]

Modes (pick one primary; defaults to --idle):
  --idle [SEC]     Shorten idle-delay to SEC (default 15), wait for lock
  --lock-now       Immediate ScreenSaver.Lock (control: usually no thrash)
  --dpms           Force DPMS off via xset (X11; wake with mouse/keys)
  --idle-and-dpms  Idle lock, then DPMS off once locked (closest to overnight)

Options:
  --idle-delay=N   Seconds until idle (default 15; with --idle / --idle-and-dpms)
  --lock-delay=N   Screensaver lock-delay seconds (default 0)
  --wait=N         Max seconds to wait for lock (default idle+60)
  --restore-only   Restore previously saved idle/lock gsettings and exit
  --no-restore     Do not restore gsettings after unlock (you must --restore-only)
  --force          Non-interactive
  --color=auto|always|never
  -h, --help

State file: \$XDG_STATE_HOME/forge-manage/idle-lock-saved.gsettings
  (default ~/.local/state/forge-manage/idle-lock-saved.gsettings)

Deps: gsettings, gdbus; xset for --dpms / --idle-and-dpms on X11

Examples:
  ./scripts/forge/trigger-idle-lock.zsh --idle 12
  ./scripts/forge/trigger-idle-lock.zsh --idle-and-dpms --idle-delay=10
  ./scripts/forge/trigger-idle-lock.zsh --dpms
  ./scripts/forge/trigger-idle-lock.zsh --lock-now
  ./scripts/forge/trigger-idle-lock.zsh --restore-only

After wake: check dual-head placement, retab, journalctl -e -u gnome-shell
EOF
}

MODE="idle"
IDLE_SEC=15
LOCK_DELAY=0
WAIT_MAX=0
NO_RESTORE=0
RESTORE_ONLY=0

forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --idle)
      MODE=idle
      if [[ -n "${2:-}" && "$2" != -* ]]; then
        IDLE_SEC="$2"; shift 2
      else
        shift
      fi
      ;;
    --idle-delay=*) IDLE_SEC="${1#--idle-delay=}"; shift ;;
    --idle-delay) IDLE_SEC="${2:?}"; shift 2 ;;
    --lock-delay=*) LOCK_DELAY="${1#--lock-delay=}"; shift ;;
    --lock-delay) LOCK_DELAY="${2:?}"; shift 2 ;;
    --wait=*) WAIT_MAX="${1#--wait=}"; shift ;;
    --wait) WAIT_MAX="${2:?}"; shift 2 ;;
    --lock-now) MODE=lock-now; shift ;;
    --dpms) MODE=dpms; shift ;;
    --idle-and-dpms) MODE=idle-and-dpms; shift ;;
    --restore-only) RESTORE_ONLY=1; shift ;;
    --no-restore) NO_RESTORE=1; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) forge_die "unexpected arg: $1" ;;
  esac
done

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/forge-manage"
STATE_FILE="$STATE_DIR/idle-lock-saved.gsettings"

forge_need_cmd gsettings
forge_need_cmd gdbus

_save_settings() {
  mkdir -p "$STATE_DIR"
  {
    print -r -- "idle-delay=$(gsettings get org.gnome.desktop.session idle-delay)"
    print -r -- "lock-delay=$(gsettings get org.gnome.desktop.screensaver lock-delay)"
    print -r -- "lock-enabled=$(gsettings get org.gnome.desktop.screensaver lock-enabled)"
    print -r -- "idle-activation-enabled=$(gsettings get org.gnome.desktop.screensaver idle-activation-enabled)"
  } >"$STATE_FILE"
  forge_ok "saved idle/lock settings → $STATE_FILE"
}

_restore_settings() {
  [[ -f "$STATE_FILE" ]] || forge_die "no saved state at $STATE_FILE (nothing to restore)"
  local line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" != *"="* ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    case "$key" in
      idle-delay)
        gsettings set org.gnome.desktop.session idle-delay "$val"
        forge_ok "restored session idle-delay → $val"
        ;;
      lock-delay)
        gsettings set org.gnome.desktop.screensaver lock-delay "$val"
        forge_ok "restored screensaver lock-delay → $val"
        ;;
      lock-enabled)
        gsettings set org.gnome.desktop.screensaver lock-enabled "$val"
        forge_ok "restored screensaver lock-enabled → $val"
        ;;
      idle-activation-enabled)
        gsettings set org.gnome.desktop.screensaver idle-activation-enabled "$val"
        forge_ok "restored screensaver idle-activation-enabled → $val"
        ;;
    esac
  done <"$STATE_FILE"
}

_is_locked() {
  # org.gnome.ScreenSaver.GetActive → (true,) or (false,)
  local out
  out=$(gdbus call --session \
    --dest org.gnome.ScreenSaver \
    --object-path /org/gnome/ScreenSaver \
    --method org.gnome.ScreenSaver.GetActive 2>/dev/null || true)
  [[ "$out" == *true* ]]
}

_lock_now() {
  gdbus call --session \
    --dest org.gnome.ScreenSaver \
    --object-path /org/gnome/ScreenSaver \
    --method org.gnome.ScreenSaver.Lock >/dev/null
}

_dpms_off() {
  forge_need_cmd xset
  if [[ "${XDG_SESSION_TYPE:-}" == "wayland" ]]; then
    forge_warn "DPMS via xset is unreliable on Wayland; trying anyway"
  fi
  xset dpms force off
  forge_ok "DPMS forced off (move mouse / press a key to wake)"
}

_wait_for_lock() {
  local max="$1" start now elapsed
  start=$(date +%s)
  forge_info "do not touch keyboard/mouse — waiting up to ${max}s for lock…"
  while true; do
    if _is_locked; then
      forge_ok "screen is locked"
      return 0
    fi
    now=$(date +%s)
    elapsed=$((now - start))
    if (( elapsed >= max )); then
      forge_die "timed out after ${max}s waiting for lock (moved mouse? inhibit active?)"
    fi
    sleep 1
  done
}

_wait_for_unlock() {
  forge_info "unlock when ready — settings restore after unlock (Ctrl-C restores now)"
  while _is_locked; do
    sleep 1
  done
  forge_ok "unlocked"
}

if (( RESTORE_ONLY )); then
  forge_hdr "Restore idle/lock gsettings"
  _restore_settings
  exit 0
fi

# Validate numerics
[[ "$IDLE_SEC" == <-> ]] || forge_die "idle seconds must be integer: $IDLE_SEC"
[[ "$LOCK_DELAY" == <-> ]] || forge_die "lock-delay must be integer: $LOCK_DELAY"
(( IDLE_SEC >= 5 )) || forge_die "idle-delay must be >= 5 (got $IDLE_SEC)"
if (( WAIT_MAX == 0 )); then
  WAIT_MAX=$((IDLE_SEC + 60))
fi
[[ "$WAIT_MAX" == <-> ]] || forge_die "wait must be integer: $WAIT_MAX"

cleanup() {
  local ec=$?
  if (( NO_RESTORE == 0 )) && [[ -f "$STATE_FILE" ]]; then
    forge_info "restoring idle/lock settings…"
    _restore_settings || true
  fi
  exit $ec
}
trap cleanup EXIT INT TERM

forge_hdr "Forge blank/wake trigger ($MODE)"

case "$MODE" in
  lock-now)
    forge_info "immediate lock (usually keeps placement — control path)"
    if ! forge_confirm "Lock screen now?"; then
      forge_die "aborted"
    fi
    # No gsettings change for lock-now; avoid restoring unrelated state
    NO_RESTORE=1
    trap - EXIT INT TERM
    _lock_now
    forge_ok "locked — unlock and check window placement"
    ;;
  dpms)
    if ! forge_confirm "Force DPMS off now (displays blank)?"; then
      forge_die "aborted"
    fi
    NO_RESTORE=1
    trap - EXIT INT TERM
    _dpms_off
    ;;
  idle|idle-and-dpms)
    forge_info "will set idle-delay=${IDLE_SEC}s lock-delay=${LOCK_DELAY}s"
    forge_info "then wait for idle auto-lock (hands off keyboard/mouse)"
    if ! forge_confirm "Shorten idle timer and wait for lock?"; then
      forge_die "aborted"
    fi
    _save_settings
    gsettings set org.gnome.desktop.session idle-delay "uint32 $IDLE_SEC"
    gsettings set org.gnome.desktop.screensaver lock-delay "uint32 $LOCK_DELAY"
    gsettings set org.gnome.desktop.screensaver lock-enabled true
    gsettings set org.gnome.desktop.screensaver idle-activation-enabled true
    forge_ok "idle-delay=$IDLE_SEC lock-delay=$LOCK_DELAY (saved previous in $STATE_FILE)"
    # Reset Mutter idle so the new short delay starts now
    gdbus call --session \
      --dest org.gnome.Mutter.IdleMonitor \
      --object-path /org/gnome/Mutter/IdleMonitor/Core \
      --method org.gnome.Mutter.IdleMonitor.ResetIdletime >/dev/null 2>&1 || true
    _wait_for_lock "$WAIT_MAX"
    if [[ "$MODE" == "idle-and-dpms" ]]; then
      sleep 1
      _dpms_off || true
    fi
    _wait_for_unlock
    forge_info "check: windows on both monitors? retab ok? journal clean?"
    ;;
  *)
    forge_die "unknown mode: $MODE"
    ;;
esac
