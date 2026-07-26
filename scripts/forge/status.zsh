#!/usr/bin/env zsh
# Show Forge install + settings status.
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}status.zsh${c_reset} — show Forge install, settings, backups

Usage: status.zsh [--color=auto|always|never] [-h]
EOF
}

forge_parse_common_args "$@"
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

forge_hdr "Forge status"
print -- "UUID:            ${c_cyan}$FORGE_UUID${c_reset}"
print -- "Session:         ${c_cyan}$(forge_session_type)${c_reset}"
print -- "GNOME Shell:     ${c_blue}$(gnome-shell --version 2>/dev/null || echo unknown)${c_reset}"
print -- "Extension dir:   ${c_cyan}$FORGE_EXT_DIR${c_reset}"

if forge_ext_installed; then
  print -- "Installed:       ${c_green}yes${c_reset} (lineage=${c_cyan}$(forge_detect_lineage)${c_reset})"
  print -- "  version:       ${c_blue}$(forge_metadata_field version 2>/dev/null || echo n/a)${c_reset}"
  print -- "  version-name:  ${c_blue}$(forge_metadata_field version-name 2>/dev/null || echo n/a)${c_reset}"
  print -- "  url:           $(forge_metadata_field url 2>/dev/null || echo n/a)"
  if forge_ext_enabled; then
    print -- "Enabled:         ${c_green}yes${c_reset}"
  else
    print -- "Enabled:         ${c_yellow}no${c_reset}"
  fi
  state=$(gnome-extensions info "$FORGE_UUID" 2>/dev/null | awk -F': ' '/State:/{print $2; exit}' || true)
  [[ -n "$state" ]] && print -- "State:           $state"
else
  print -- "Installed:       ${c_red}no${c_reset}"
fi

print -- "Config dir:      ${c_cyan}$FORGE_CONFIG_DIR${c_reset}"
if [[ -d "$FORGE_CONFIG_DIR" ]]; then
  print -- "  files:"
  find "$FORGE_CONFIG_DIR" -type f 2>/dev/null | sed 's/^/    /' || true
else
  print -- "  (missing)"
fi

# dconf summary
if command -v dconf >/dev/null; then
  n=$(dconf dump "$FORGE_DCONF_PATH" 2>/dev/null | grep -c '=' || true)
  print -- "dconf keys≈      ${c_blue}${n}${c_reset}  ($FORGE_DCONF_PATH)"
fi

print -- "Backup root:     ${c_cyan}$FORGE_BACKUP_ROOT${c_reset}"
if [[ -d "$FORGE_BACKUP_ROOT" ]]; then
  ls -1dt "$FORGE_BACKUP_ROOT"/*/ 2>/dev/null | head -5 | while read -r d; do
    print -- "  ${c_cyan}${d%/}${c_reset}"
  done
  [[ -L "$FORGE_BACKUP_ROOT/latest" ]] && print -- "  latest → $(readlink -f "$FORGE_BACKUP_ROOT/latest" 2>/dev/null || readlink "$FORGE_BACKUP_ROOT/latest")"
else
  print -- "  (no backups yet)"
fi

print -- "Repo:            ${c_cyan}$FORGE_REPO_ROOT${c_reset}"
if [[ -d "$FORGE_REPO_ROOT/.git" ]]; then
  print -- "  describe:      ${c_blue}$(git -C "$FORGE_REPO_ROOT" describe --tags --always --dirty 2>/dev/null)${c_reset}"
  print -- "  remote:        $(git -C "$FORGE_REPO_ROOT" remote get-url origin 2>/dev/null || echo n/a)"
fi

if origin_path=$(forge_read_install_origin 2>/dev/null); then
  print -- "Install origin:  ${c_cyan}$origin_path${c_reset}"
  print -- "  source:        ${c_cyan}$(forge_origin_field source 2>/dev/null || echo n/a)${c_reset}"
  print -- "  repo:          ${c_cyan}$(forge_origin_field repo 2>/dev/null || echo n/a)${c_reset}"
  print -- "  install:       $(forge_origin_field install_script 2>/dev/null || echo n/a)"
  print -- "  installed_at:  $(forge_origin_field installed_at 2>/dev/null || echo n/a)"
else
  print -- "Install origin:  ${c_yellow}(none — run ./install or scripts/install.zsh once)${c_reset}"
fi

print -- "CLI bin:         ${c_cyan}$FORGE_CLI_BIN${c_reset}"
if [[ -L "$FORGE_CLI_BIN" ]]; then
  link=$(readlink "$FORGE_CLI_BIN" 2>/dev/null || true)
  if forge_cli_bin_is_ours; then
    print -- "  symlink:       ${c_green}ours${c_reset} → ${c_cyan}$link${c_reset}"
  else
    print -- "  symlink:       ${c_yellow}foreign${c_reset} → ${c_cyan}$link${c_reset}"
  fi
elif [[ -e "$FORGE_CLI_BIN" ]]; then
  if forge_cli_bin_is_ours; then
    print -- "  present:       ${c_green}ours${c_reset}"
  else
    print -- "  present:       ${c_yellow}foreign (not our install)${c_reset}"
  fi
else
  print -- "  present:       ${c_yellow}no${c_reset} (run ./install)"
fi
if command -v forge >/dev/null 2>&1; then
  print -- "  on PATH:       ${c_green}$(command -v forge)${c_reset}"
else
  print -- "  on PATH:       ${c_yellow}no${c_reset}"
  if [[ ":$PATH:" != *":$FORGE_CLI_BIN_DIR:"* ]]; then
    print -- "  hint:          add ${c_blue}$FORGE_CLI_BIN_DIR${c_reset} to PATH"
  fi
fi
