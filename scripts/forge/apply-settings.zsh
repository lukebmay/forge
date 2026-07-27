#!/usr/bin/env zsh
# Apply a saved Forge backup (dconf + optional config files) to the live system.
# Usage: apply-settings.zsh [--translate=jcrussell] [--force] [backup-dir]
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}apply-settings.zsh${c_reset} — restore Forge settings from a backup

Usage:
  apply-settings.zsh [options] [backup-dir]

Arguments:
  backup-dir     Directory from save-settings (default: \$FORGE_BACKUP_ROOT/latest)

Options:
  --translate=TARGET   Run translate-settings before load (jcrussell|ego|installed)
  --no-translate       Load dconf dump as-is (default if not --translate)
  --dconf-only         Only load dconf (skip ~/.config/forge restore)
  --config-only        Only restore ~/.config/forge
  --no-config          Skip config restore
  --no-theme           Skip stylesheet / css-last-update stamping
  --force              Non-interactive; required when not a TTY
  --color=auto|always|never
  -h, --help

Notes:
  • dconf is the live source of truth for Forge prefs/keybindings.
  • Colors live in ~/.config/forge/stylesheet/forge/stylesheet.css  (this tree).
  • After EGO→jcrussell, apply restores CSS and stamps css-last-update so
    enable()/patchCss does not replace your theme with defaults.
  • After switching EGO → jcrussell, prefer --translate=jcrussell.
  • Extension code itself is NOT restored here (use rollback.zsh).

$(forge_print_deps_help)
EOF
}

TRANSLATE=""
DO_DCONF=1
DO_CONFIG=1
DO_THEME=1
forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --translate=*) TRANSLATE="${1#--translate=}"; shift ;;
    --translate) TRANSLATE="${2:?}"; shift 2 ;;
    --no-translate) TRANSLATE=""; shift ;;
    --dconf-only) DO_CONFIG=0; DO_THEME=0; shift ;;
    --config-only) DO_DCONF=0; shift ;;
    --no-config) DO_CONFIG=0; shift ;;
    --no-theme) DO_THEME=0; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) break ;;
  esac
done

forge_need_cmd dconf

SRC="${1:-}"
if [[ -z "$SRC" ]]; then
  SRC=$(forge_latest_backup) || forge_die "no backups under $FORGE_BACKUP_ROOT"
fi
[[ -d "$SRC" ]] || forge_die "backup not found: $SRC"

forge_hdr "Apply settings from $SRC"
forge_info "lineage now: $(forge_detect_lineage); session: $(forge_session_type)"

if ! forge_confirm "Load settings from ${c_cyan}$SRC${c_reset} into live dconf/config?"; then
  forge_die "aborted"
fi

if (( DO_DCONF )); then
  dump="$SRC/dconf-forge.conf"
  [[ -f "$dump" ]] || forge_die "missing $dump"
  [[ -s "$dump" ]] || forge_die "backup dconf is empty: $dump (refusing to wipe live settings)"

  use_dump="$dump"
  if [[ -n "$TRANSLATE" ]]; then
    forge_info "translating dconf → target schema: $TRANSLATE"
    # Write to a known path; do not rely solely on command substitution.
    applied="$SRC/dconf-applied.conf"
    "$SCRIPT_DIR/translate-settings.zsh" --to="$TRANSLATE" "$dump" "$applied" >/dev/null
    use_dump="$applied"
    [[ -f "$use_dump" && -s "$use_dump" ]] || forge_die "translate produced empty dump"
  elif [[ -f "$SRC/dconf-translated.conf" && -s "$SRC/dconf-translated.conf" ]]; then
    forge_info "using existing dconf-translated.conf"
    use_dump="$SRC/dconf-translated.conf"
  fi

  # Safety: refuse to load a dump with far fewer keys than the raw backup
  # (dconf load replaces the whole subtree).
  raw_n=$(grep -c '=' "$dump" || true)
  use_n=$(grep -c '=' "$use_dump" || true)
  if (( raw_n > 0 && use_n * 2 < raw_n )); then
    forge_die "translated dump has $use_n keys vs backup $raw_n — refusing (possible data loss). Inspect $use_dump"
  fi
  if (( use_n == 0 )); then
    forge_die "refusing dconf load of 0 keys from $use_dump"
  fi

  # dconf load replaces the subtree with the dump contents
  dconf load "$FORGE_DCONF_PATH" <"$use_dump"
  forge_ok "dconf loaded from ${use_dump:t} ($use_n keys)"
fi

if (( DO_CONFIG )); then
  if [[ -d "$SRC/config" ]]; then
    mkdir -p "$FORGE_CONFIG_DIR"
    # Merge carefully: copy tree
    cp -a "$SRC/config"/. "$FORGE_CONFIG_DIR"/
    forge_ok "restored $FORGE_CONFIG_DIR"
  elif [[ -d "$SRC/config/config" ]]; then
    # in case someone nested oddly
    cp -a "$SRC/config"/. "$FORGE_CONFIG_DIR"/
    forge_ok "restored $FORGE_CONFIG_DIR (nested)"
  else
    forge_info "no config/ in backup (skipped)"
  fi
fi

if (( DO_THEME )); then
  # Colors: user CSS + stamp css-last-update so a later enable()/patchCss
  # does not overwrite with the extension default stylesheet.
  forge_restore_theme_from_backup "$SRC"
fi

forge_ok "apply complete — Super+Shift+r to reload CSS; log out/in if prefs look stale"
print -r -- "$SRC"
