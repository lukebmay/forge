#!/usr/bin/env zsh
# Save settings → uninstall → install EGO → apply (optional translate to ego schema).
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}switch-to-ego.zsh${c_reset} — migrate back to extensions.gnome.org Forge

Pipeline:
  1. save-settings
  2. uninstall
  3. install-ego
  4. apply-settings (--translate=ego when backup was from jcrussell)

Usage:
  switch-to-ego.zsh [options]

Options:
  --version-tag=PK  Pin EGO version_tag
  --skip-save
  --skip-apply
  --name=LABEL
  --force
  --color=auto|always|never
  -h, --help

$(forge_print_deps_help)
EOF
}

EGO_ARGS=()
SKIP_SAVE=0
SKIP_APPLY=0
NAME=""
forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --version-tag=*) EGO_ARGS+=("$1"); shift ;;
    --version-tag) EGO_ARGS+=(--version-tag "$2"); shift 2 ;;
    --skip-save) SKIP_SAVE=1; shift ;;
    --skip-apply) SKIP_APPLY=1; shift ;;
    --name=*) NAME="${1#--name=}"; shift ;;
    --name) NAME="${2:?}"; shift 2 ;;
    -*) forge_die "unknown option: $1" ;;
    *) forge_die "unexpected arg: $1" ;;
  esac
done

forge_hdr "Switch → EGO Forge"
forge_info "current lineage: $(forge_detect_lineage)"

if ! forge_confirm "Save (unless skipped), replace extension with EGO, re-apply settings?"; then
  forge_die "aborted"
fi

export FORGE_FORCE=1

BACKUP=""
if (( ! SKIP_SAVE )); then
  label="${NAME:-switch-ego-$(forge_stamp)}"
  BACKUP=$("$SCRIPT_DIR/save-settings.zsh" --name="$label" --force)
else
  BACKUP=$(forge_latest_backup) || forge_die "--skip-save but no backups found"
fi

"$SCRIPT_DIR/uninstall.zsh" --force
"$SCRIPT_DIR/install-ego.zsh" --force "${EGO_ARGS[@]}"

if (( ! SKIP_APPLY )); then
  # Translate toward ego schema so jcrussell-only keys are dropped
  "$SCRIPT_DIR/apply-settings.zsh" --force --translate=ego "$BACKUP"
fi

gnome-extensions enable "$FORGE_UUID" 2>/dev/null \
  || forge_warn "enable deferred — log out/in then: gnome-extensions enable $FORGE_UUID"

forge_ok "switch-to-ego complete"
print -r -- "$BACKUP"
