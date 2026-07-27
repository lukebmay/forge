#!/usr/bin/env zsh
# Uninstall the live Forge extension (user install). Settings in dconf are kept.
# Usage: uninstall.zsh [--purge-config] [--purge-dconf] [--force]
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}uninstall.zsh${c_reset} — remove installed Forge extension + user CLI

Usage:
  uninstall.zsh [options]
  forge uninstall [options]

Options:
  --purge-config   Also delete ~/.config/forge
  --purge-dconf    Also reset dconf tree $FORGE_DCONF_PATH
  --keep-cli       Leave $FORGE_CLI_BIN (default: remove if forge-owned)
  --force          Non-interactive
  --color=auto|always|never
  -h, --help

Notes:
  • By default **settings are kept** in dconf so reinstall restores prefs.
  • Removes ${c_cyan}$FORGE_CLI_BIN${c_reset} only when it is our symlink/wrapper.
  • Does not touch backups under $FORGE_BACKUP_ROOT
  • Keeps install-origin.json so ${c_blue}forge install${c_reset} can reinstall.
  • EGO and this tree share UUID $FORGE_UUID — this removes whichever is installed.

$(forge_print_deps_help)
EOF
}

PURGE_CFG=0
PURGE_DCONF=0
KEEP_CLI=0
forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --purge-config) PURGE_CFG=1; shift ;;
    --purge-dconf) PURGE_DCONF=1; shift ;;
    --keep-cli) KEEP_CLI=1; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) forge_die "unexpected arg: $1" ;;
  esac
done

forge_need_cmd gnome-extensions

ext_was=0
forge_ext_installed && ext_was=1

if (( ! ext_was )); then
  forge_warn "extension not installed at $FORGE_EXT_DIR"
else
  forge_hdr "Uninstall Forge ($(forge_detect_lineage))"
  forge_info "path: $FORGE_EXT_DIR"
fi
(( PURGE_CFG )) && forge_warn "will delete $FORGE_CONFIG_DIR"
(( PURGE_DCONF )) && forge_warn "will reset dconf $FORGE_DCONF_PATH"
(( ! KEEP_CLI )) && forge_info "will remove CLI if owned: $FORGE_CLI_BIN"

if (( ext_was || PURGE_CFG || PURGE_DCONF || ! KEEP_CLI )); then
  if ! forge_confirm "Uninstall Forge now?"; then
    forge_die "aborted"
  fi
fi

if (( ext_was )); then
  gnome-extensions disable "$FORGE_UUID" 2>/dev/null || true
  rm -rf "$FORGE_EXT_DIR"
  forge_ok "removed extension dir"
fi

if (( PURGE_CFG )); then
  rm -rf "$FORGE_CONFIG_DIR"
  forge_ok "removed $FORGE_CONFIG_DIR"
elif [[ -d "$FORGE_CONFIG_DIR" ]]; then
  forge_info "kept $FORGE_CONFIG_DIR (pass --purge-config to delete)"
fi

if (( PURGE_DCONF )); then
  forge_need_cmd dconf
  dconf reset -f "$FORGE_DCONF_PATH"
  forge_ok "dconf reset $FORGE_DCONF_PATH"
else
  forge_info "kept dconf $FORGE_DCONF_PATH (pass --purge-dconf to reset)"
fi

if (( ! KEEP_CLI )); then
  forge_uninstall_cli_bin
else
  forge_info "kept CLI ($FORGE_CLI_BIN)"
fi

forge_ok "uninstall complete"
forge_info "reinstall: forge install  # or ./install from the clone"
