#!/usr/bin/env zsh
# Rebuild this tree into the live extension and reload Shell (daily-driver loop).
# For EGO → jcrussell first install, use switch-to-jcrussell.zsh instead.
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}update-jcrussell.zsh${c_reset} — install current repo into the running Forge extension

Rebuilds this git tree (default: debug / make dev), replaces the user extension
in place (same UUID), enables it, and ${c_bold}reloads Shell on X11${c_reset} so the new
code is active. Prefer root ${c_blue}./install${c_reset} (lineage-aware).

First time on EGO: ${c_blue}./install${c_reset} or ${c_blue}switch-to-jcrussell.zsh${c_reset}.

Usage:
  update-jcrussell.zsh [options]

Options:
  --repo=PATH         Repo root (default: $FORGE_REPO_ROOT)
  --prod              Release-style build (production=true); default is --dev
  --dev               Debug build (default)
  --save              Backup extension + dconf + config before replace
  --restart-shell     X11 HUP after install (default)
  --no-restart        Do not HUP gnome-shell (files only until you reload)
  --reload-theme      After install, stamp + bump css-updated (user stylesheet)
  --no-host-defaults  Skip apply-host-defaults.zsh
  --skip-npm          Pass through to install-jcrussell
  --from-ego          If installed lineage is EGO, run switch-to-jcrussell instead
  --force             Non-interactive / CI (skip confirms)
  --verbose, -v       Detailed build/install logs
  --color=auto|always|never
  -h, --help

Examples:
  ./install
  ./scripts/forge/update-jcrussell.zsh
  ./scripts/forge/update-jcrussell.zsh --no-restart
  forge-ctl update

Wayland: in-session reload is unavailable — log out/in after install.
Toggle layout overlay: ${c_blue}Ctrl+Super+d${c_reset}

$(forge_print_deps_help)
EOF
}

MODE="dev"
DO_SAVE=0
# Default: reload Shell so the new build is active (opt out with --no-restart).
DO_RESTART=1
DO_RELOAD_THEME=0
DO_HOST_DEFAULTS=1
SKIP_NPM=0
FROM_EGO=0

forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --prod) MODE="prod"; shift ;;
    --dev) MODE="dev"; shift ;;
    --save) DO_SAVE=1; shift ;;
    --no-restart|--no-restart-shell) DO_RESTART=0; shift ;;
    --restart-shell) DO_RESTART=1; shift ;;
    --reload-theme) DO_RELOAD_THEME=1; shift ;;
    --no-host-defaults) DO_HOST_DEFAULTS=0; shift ;;
    --skip-npm) SKIP_NPM=1; shift ;;
    --from-ego) FROM_EGO=1; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) forge_die "unexpected arg: $1" ;;
  esac
done

forge_need_cmd make gnome-extensions
[[ -f "$FORGE_REPO_ROOT/Makefile" ]] || forge_die "not a forge repo: $FORGE_REPO_ROOT"

lineage="none"
if forge_ext_installed; then
  lineage=$(forge_detect_lineage)
fi

if [[ "$lineage" == "ego" ]]; then
  if (( FROM_EGO )); then
    forge_warn "installed lineage is EGO — running switch-to-jcrussell (full migrate)"
    args=(--force)
    (( DO_RESTART )) && args+=(--restart-shell)
    exec "$SCRIPT_DIR/switch-to-jcrussell.zsh" "${args[@]}"
  fi
  forge_die "installed Forge is EGO/SweetTooth. First migrate with:
  $SCRIPT_DIR/switch-to-jcrussell.zsh
or re-run this script with --from-ego"
fi

if [[ "$lineage" == "none" ]]; then
  forge_info "no extension installed yet — will install fresh from this tree"
elif [[ "$lineage" != "jcrussell" && "$lineage" != "unknown" ]]; then
  forge_warn "lineage=$lineage (expected jcrussell); continuing with in-place replace"
fi

forge_hdr "Update live Forge from $FORGE_REPO_ROOT"
forge_info "session: $(forge_session_type) | mode: $MODE | lineage: $lineage"
if [[ -d "$FORGE_REPO_ROOT/.git" ]]; then
  forge_info "repo: $(git -C "$FORGE_REPO_ROOT" describe --tags --always --dirty 2>/dev/null || echo n/a)"
fi

if forge_ext_installed; then
  before_vn=$(forge_metadata_field version-name 2>/dev/null || print "n/a")
  forge_info "installed version-name (before): ${c_blue}$before_vn${c_reset}"
fi

if ! forge_confirm "Build + install this tree over $FORGE_EXT_DIR?"; then
  forge_die "aborted"
fi

if (( DO_SAVE )); then
  forge_hdr "Backup before update"
  "$SCRIPT_DIR/save-settings.zsh" --force || forge_die "save failed"
fi

install_args=(--force)
[[ "$MODE" == "prod" ]] && install_args+=(--prod) || install_args+=(--dev)
(( SKIP_NPM )) && install_args+=(--skip-npm)
(( ! DO_HOST_DEFAULTS )) && install_args+=(--no-host-defaults)

forge_hdr "Build + install"
"$SCRIPT_DIR/install-jcrussell.zsh" "${install_args[@]}"

after_vn=$(forge_metadata_field version-name 2>/dev/null || print "n/a")
forge_ok "installed version-name: ${c_blue}$after_vn${c_reset}"

# Prove new schemas resolve (catches incomplete install before shell reload)
if command -v gsettings >/dev/null 2>&1; then
  sd="$FORGE_EXT_DIR/schemas"
  if [[ -d "$sd" ]]; then
    n=$(GSETTINGS_SCHEMA_DIR="$sd" gsettings list-keys "$FORGE_SCHEMA_MAIN" 2>/dev/null | wc -l || true)
    forge_info "installed schema keys (main): $n"
    if GSETTINGS_SCHEMA_DIR="$sd" gsettings range "$FORGE_SCHEMA_MAIN" layout-debug-overlay-enabled >/dev/null 2>&1; then
      forge_ok "schema has layout-debug-overlay-enabled"
    fi
  fi
fi

gnome-extensions enable "$FORGE_UUID" 2>/dev/null \
  || forge_warn "enable failed (may need shell restart first)"

if (( DO_RELOAD_THEME )); then
  forge_hdr "Reload user stylesheet"
  "$SCRIPT_DIR/reload-theme.zsh" --force || forge_warn "reload-theme failed (non-fatal)"
fi

if (( DO_RESTART )); then
  forge_hdr "Reload GNOME Shell"
  rc=0
  forge_restart_shell || rc=$?
  if (( rc == 0 )); then
    sleep 1
    gnome-extensions enable "$FORGE_UUID" 2>/dev/null || true
    if (( DO_RELOAD_THEME )); then
      "$SCRIPT_DIR/reload-theme.zsh" --force 2>/dev/null || true
    fi
    forge_ok "shell reloaded; extension should be running the new build"
  elif (( rc == 2 )); then
    forge_warn "code is installed; log out/in so Shell loads it"
  fi
else
  forge_hdr "Shell not reloaded (--no-restart)"
  st=$(forge_session_type)
  if [[ "$st" == "x11" ]]; then
    forge_warn "Files updated; Shell still runs old code until you reload:"
    forge_warn "  ${c_blue}Alt+F2${c_reset} → ${c_blue}r${c_reset}  or  ${c_blue}killall -HUP gnome-shell${c_reset}"
  else
    forge_warn "Files updated; log out/in (session=${c_cyan}$st${c_reset}) to load the new build."
  fi
fi

forge_write_install_origin "$FORGE_REPO_ROOT" git || \
  forge_warn "could not write install-origin (non-fatal)"
forge_ok "update complete (lineage=$(forge_detect_lineage))"
forge_info "status: $SCRIPT_DIR/status.zsh"
forge_info "reinstall: forge install  # or $FORGE_REPO_ROOT/install"
print -r -- "$FORGE_EXT_DIR"
