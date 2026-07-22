#!/usr/bin/env zsh
# Apply host keyboard defaults (lock, quit, maximize, …) after Forge install.
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}apply-host-defaults.zsh${c_reset} — apply scripts/forge/host-defaults.conf

Sets Forge + GNOME keybindings that should survive a jcrussell install.
Notably: lock on Super+Delete via Forge (GNOME screensaver is cleared by
Forge enable to free Super+l for focus-right).

Usage:
  apply-host-defaults.zsh [options] [conf-file]

Options:
  --conf=FILE   Defaults file (default: $SCRIPT_DIR/host-defaults.conf)
  --dry-run     Print actions only
  --force
  --color=auto|always|never
  -h, --help

$(forge_print_deps_help)
EOF
}

CONF="$SCRIPT_DIR/host-defaults.conf"
DRY=0
forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --conf=*) CONF="${1#--conf=}"; shift ;;
    --conf) CONF="${2:?}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) CONF="$1"; shift; break ;;
  esac
done

[[ -f "$CONF" ]] || forge_die "defaults file not found: $CONF"
forge_need_cmd gsettings

sd=$(forge_schema_dir) || forge_die "Forge schemas not found (install extension first)"
export GSETTINGS_SCHEMA_DIR="$sd"

forge_hdr "Apply host defaults from $CONF"

apply_one() {
  local schema="$1" key="$2" value="$3"
  if (( DRY )); then
    forge_info "dry-run: gsettings set $schema $key $value"
    return 0
  fi
  if ! gsettings list-keys "$schema" 2>/dev/null | grep -qx "$key"; then
    forge_warn "skip unknown key $schema $key"
    return 0
  fi
  gsettings set "$schema" "$key" "$value"
  forge_ok "$schema $key → $value"
}

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="${line##[[:space:]]}"
  line="${line%%[[:space:]]}"
  [[ -z "$line" ]] && continue
  [[ "$line" != *"="* ]] && forge_die "bad line (need key=value): $line"
  left="${line%%=*}"
  right="${line#*=}"
  left="${left// /}"
  case "$left" in
    forge.kbd.*)
      apply_one "org.gnome.shell.extensions.forge.keybindings" "${left#forge.kbd.}" "$right"
      ;;
    gnome.wm.*)
      apply_one "org.gnome.desktop.wm.keybindings" "${left#gnome.wm.}" "$right"
      ;;
    gnome.media.*)
      apply_one "org.gnome.settings-daemon.plugins.media-keys" "${left#gnome.media.}" "$right"
      ;;
    *)
      forge_die "unknown prefix in: $left (use forge.kbd.|gnome.wm.|gnome.media.)"
      ;;
  esac
done <"$CONF"

# Sanity: Super+q must not be Forge lock if host wants it for close
if (( ! DRY )); then
  lock=$(gsettings get org.gnome.shell.extensions.forge.keybindings prefs-lock-screen 2>/dev/null || true)
  close=$(gsettings get org.gnome.desktop.wm.keybindings close 2>/dev/null || true)
  forge_info "verify lock=$lock"
  forge_info "verify close=$close"
  forge_info "verify toggle-maximized=$(gsettings get org.gnome.desktop.wm.keybindings toggle-maximized)"
  if [[ "$lock" == *"<Super>q"* ]]; then
    forge_warn "prefs-lock-screen still includes Super+q — edit $CONF"
  fi
fi

forge_ok "host defaults applied"
print -r -- "$CONF"
