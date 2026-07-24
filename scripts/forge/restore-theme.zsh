#!/usr/bin/env zsh
# Restore Forge colors/stylesheet from a backup and stamp css-last-update
# so jcrussell enable()/patchCss does not overwrite with defaults.
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}restore-theme.zsh${c_reset} — restore border/theme CSS from a forge-manage backup

Why this exists:
  jcrussell stores focus/split colors in
  ~/.config/forge/stylesheet/forge/stylesheet.css
  EGO also had gsettings focus-border-color / split-border-color.

  On first enable after upgrade, patchCss() copies defaults over the user
  stylesheet when css-last-update != ThemeManager.cssTag, leaving a .bak.

Usage:
  restore-theme.zsh [options] [backup-dir]

Options:
  --stamp-only     Only set css-last-update (no file copy)
  --force
  --color=auto|always|never
  -h, --help

Default backup: \$FORGE_BACKUP_ROOT/latest

After restore, the script bumps css-updated so a live extension reloads CSS.
Fallback: Super+Shift+r (also reloads stylesheet) or log out/in.

$(forge_print_deps_help)
EOF
}

STAMP_ONLY=0
forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --stamp-only) STAMP_ONLY=1; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) break ;;
  esac
done

SRC="${1:-}"
if [[ -z "$SRC" ]]; then
  SRC=$(forge_latest_backup) || forge_die "no backups under $FORGE_BACKUP_ROOT"
fi
[[ -d "$SRC" ]] || forge_die "backup not found: $SRC"

forge_hdr "Restore theme from $SRC"

if (( STAMP_ONLY )); then
  forge_stamp_css_last_update
else
  if ! forge_confirm "Restore stylesheet colors from backup into $(forge_user_stylesheet_path)?"; then
    forge_die "aborted"
  fi
  export FORGE_FORCE=1
  forge_restore_theme_from_backup "$SRC"
fi

if (( STAMP_ONLY )); then
  forge_trigger_css_reload
fi
forge_ok "done — colors should apply live; Super+Shift+r also reloads CSS"
print -r -- "$(forge_user_stylesheet_path)"
