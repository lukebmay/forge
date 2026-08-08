#!/usr/bin/env zsh
# Restore a previous extension tree (+ optional settings) from a save-settings backup.
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}rollback.zsh${c_reset} — restore extension from a backup made by save-settings

Usage:
  rollback.zsh [options] [backup-dir]

Options:
  --settings-too   Also apply-settings from the same backup
  --translate=T    With --settings-too, translate dconf to T
  --force
  --color=auto|always|never
  -h, --help

Default backup: \$FORGE_BACKUP_ROOT/latest

This copies backup/extension → $FORGE_EXT_DIR (full replace).

$(forge_print_deps_help)
EOF
}

DO_SETTINGS=0
TRANSLATE=""
forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --settings-too) DO_SETTINGS=1; shift ;;
    --translate=*) TRANSLATE="${1#--translate=}"; shift ;;
    --translate) TRANSLATE="${2:?}"; shift 2 ;;
    -*) forge_die "unknown option: $1" ;;
    *) break ;;
  esac
done

SRC="${1:-}"
if [[ -z "$SRC" ]]; then
  SRC=$(forge_latest_backup) || forge_die "no backups under $FORGE_BACKUP_ROOT"
fi
[[ -d "$SRC/extension" ]] || forge_die "backup has no extension/: $SRC"

forge_hdr "Rollback extension from $SRC"
forge_info "will replace $FORGE_EXT_DIR"

if ! forge_confirm "Restore extension from backup?"; then
  forge_die "aborted"
fi

export FORGE_FORCE=1
gnome-extensions disable "$FORGE_UUID" 2>/dev/null || true
rm -rf "$FORGE_EXT_DIR"
mkdir -p "$(dirname "$FORGE_EXT_DIR")"
cp -a "$SRC/extension" "$FORGE_EXT_DIR"
forge_ok "extension restored (lineage=$(forge_detect_lineage))"

if (( DO_SETTINGS )); then
  apply_args=(--force)
  [[ -n "$TRANSLATE" ]] && apply_args+=(--translate="$TRANSLATE")
  "$SCRIPT_DIR/apply-settings.zsh" "${apply_args[@]}" "$SRC"
fi

forge_enable_extension "$FORGE_UUID" \
  || forge_warn "enable deferred — log out/in then: gnome-extensions enable $FORGE_UUID"

forge_warn "Log out/in if Shell still runs old code."
print -r -- "$SRC"
