#!/usr/bin/env zsh
# Unified install: put this repo's Forge live; migrate settings when needed.
# Called from project-root ./install or via `forge install` using install-origin.
emulate -L zsh
set -euo pipefail

# scripts/install.zsh → repo root is parent of scripts/
SCRIPT_FILE=${0:A}
SCRIPTS_DIR=${SCRIPT_FILE:h}
REPO_ROOT=${SCRIPTS_DIR:h}
FORGE_SCRIPTS="${FORGE_SCRIPTS:-$SCRIPTS_DIR/forge}"

[[ -f "$FORGE_SCRIPTS/_lib.zsh" ]] || {
  print -u2 "forge install: missing $FORGE_SCRIPTS/_lib.zsh"
  exit 1
}
# Prefer this tree as FORGE_REPO_ROOT (forge install may re-enter with env set).
export FORGE_REPO_ROOT="${FORGE_REPO_ROOT:-$REPO_ROOT}"
source "$FORGE_SCRIPTS/_lib.zsh"
# Re-pin after source in case _lib defaulted elsewhere
FORGE_REPO_ROOT="$REPO_ROOT"
FORGE_SCRIPTS_DIR="$FORGE_SCRIPTS"
SCRIPT_DIR="$FORGE_SCRIPTS"

usage() {
  cat <<EOF
${c_bold}install${c_reset} — install on-disk Forge from this git tree

Default (no flags): build → install → enable → disable rival tilers →
host defaults → CLI → reload
Shell on X11. Quiet checklist UX (no prompts for routine paths).

Disables other GNOME Shell tiling extensions (Tiling Assistant, Pop Shell,
PaperWM, …) so they cannot fight Forge. Does not touch session WMs (i3/sway).

  none / unknown     → build + install this tree
  luke / jcrussell   → rebuild this tree over the live extension
  ego (SweetTooth)   → migrate with auto-backup (migrate-from-ego)

Records install origin at:
  ${c_cyan}~/.local/share/forge-manage/install-origin.json${c_reset}
so later ${c_blue}forge install${c_reset} re-runs this script from the same repo.

Also symlinks the control CLI to ${c_cyan}~/.local/bin/forge${c_reset} (remove with
${c_blue}forge uninstall${c_reset}).

Extension install dir (not printed on success; use ${c_blue}forge status${c_reset}):
  ${c_cyan}~/.local/share/gnome-shell/extensions/forge@jmmaranan.com${c_reset}

Usage:
  ./install
  ./install [options]
  forge install [options]

Options:
  --repo=PATH         Override repo root (default: this tree)
  --prod              Production build (default: dev/debug)
  --dev               Debug build (default)
  --save              Backup before replace (always on for EGO migrate)
  --no-save           Skip pre-update backup when already luke/jcrussell
  --no-restart        Do not HUP/reload Shell (files only; code stays old until you reload)
  --restart-shell     Same as default (explicit)
  --reload-theme      Stamp/reload user stylesheet after install
  --skip-npm          Skip npm install if node_modules missing
  --no-host-defaults  Skip apply-host-defaults.zsh
  --force             Non-interactive (default for this script; kept for CI flags)
  --verbose, -v       Detailed logs (make/npm/gsettings chatter)
  --color=auto|always|never
  -h, --help

Env:
  FORGE_VERBOSE=1     Same as --verbose

Examples:
  ./install
  ./install --no-restart          # copy files only; reload Shell yourself
  ./install --verbose             # full build chatter
  forge install                   # re-run from install-origin

$(forge_print_deps_help)
EOF
}

MODE="dev"
DO_SAVE="" # empty = default by lineage
# Default: reload Shell so the extension is actually running the new build.
DO_RESTART=1
DO_RELOAD_THEME=0
DO_HOST_DEFAULTS=1
SKIP_NPM=0

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
    --no-save) DO_SAVE=0; shift ;;
    --no-restart|--no-restart-shell) DO_RESTART=0; shift ;;
    --restart-shell) DO_RESTART=1; shift ;;
    --reload-theme) DO_RELOAD_THEME=1; shift ;;
    --no-host-defaults) DO_HOST_DEFAULTS=0; shift ;;
    --skip-npm) SKIP_NPM=1; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) forge_die "unexpected arg: $1" ;;
  esac
done

[[ -f "$FORGE_REPO_ROOT/Makefile" && -f "$FORGE_REPO_ROOT/metadata.json" ]] \
  || forge_die "not a forge repo: $FORGE_REPO_ROOT"
[[ -x "$SCRIPT_DIR/build-install.zsh" || -f "$SCRIPT_DIR/build-install.zsh" ]] \
  || forge_die "missing install helpers under $SCRIPT_DIR"

lineage="none"
if forge_ext_installed; then
  lineage=$(forge_detect_lineage)
fi

# Routine install is non-interactive (safe defaults always accepted).
export FORGE_FORCE=1
if forge_is_verbose; then
  export FORGE_VERBOSE=1
else
  export FORGE_INSTALL_QUIET=1
fi

# Run a named checklist step; abort on failure (log dumped by forge_run_quiet).
_install_step() {
  local name="$1"
  shift
  if forge_run_quiet "$@"; then
    forge_step_ok "$name"
    return 0
  fi
  forge_step_fail "$name"
  exit 1
}

_install_done() {
  local vn
  vn=$(forge_metadata_field version-name 2>/dev/null || print "n/a")
  # User summary only — path is in --help / forge status, not success output.
  print -u2 -- "${c_green}Installed version${c_reset} ${c_blue}${vn}${c_reset}"
  if forge_is_verbose; then
    print -u2 -- "  ${c_cyan}${FORGE_EXT_DIR}${c_reset}"
  fi
}

print -u2 -- "${c_bold}forge install${c_reset}"

case "$lineage" in
  ego)
    print -u2 -- "  ${c_cyan}note:${c_reset} migrating EGO → this tree (auto-backup)"
    args=(--force)
    [[ "$MODE" == "prod" ]] && args+=(--prod)
    if (( DO_RESTART )); then
      args+=(--restart-shell)
    else
      args+=(--no-restart)
    fi
    _install_step "Migrate" "$SCRIPT_DIR/migrate-from-ego.zsh" "${args[@]}"
    forge_write_install_origin "$FORGE_REPO_ROOT" git >/dev/null || true
    if [[ -f "$FORGE_ORIGIN_PATH" ]] && forge_cli_bin_is_ours; then
      forge_step_ok "CLI"
    else
      forge_step_warn "CLI (non-fatal)"
    fi
    if (( DO_RESTART )); then
      st=$(forge_session_type)
      if [[ "$st" == "x11" ]]; then
        forge_step_ok "Live reload"
      else
        forge_step_fail "Live reload"
        if [[ "$st" == "wayland" ]]; then
          forge_warn "must log out and back in to complete install on Wayland"
        else
          forge_warn "must log out and back in to complete install (session=$st)"
        fi
      fi
    else
      forge_step_skip "Live reload (--no-restart)"
    fi
    _install_done
    exit 0
    ;;

  luke|jcrussell)
    [[ -z "$DO_SAVE" ]] && DO_SAVE=0
    ;;

  none)
    [[ -z "$DO_SAVE" ]] && DO_SAVE=0
    ;;

  unknown|*)
    # Safer default: backup unknown installs
    [[ -z "$DO_SAVE" ]] && DO_SAVE=1
    ;;
esac

# --- luke / jcrussell / none / unknown: granular checklist ---

if (( DO_SAVE )); then
  _install_step "Backup" "$SCRIPT_DIR/save-settings.zsh" --force
fi

build_args=(--force --build-only)
[[ "$MODE" == "prod" ]] && build_args+=(--prod) || build_args+=(--dev)
(( SKIP_NPM )) && build_args+=(--skip-npm)
_install_step "Build" "$SCRIPT_DIR/build-install.zsh" "${build_args[@]}"

install_args=(--force --install-only --no-enable --no-host-defaults)
_install_step "Install extension" "$SCRIPT_DIR/build-install.zsh" "${install_args[@]}"

# Enable: soft when we will HUP (often fails until reload); hard otherwise.
if (( DO_RESTART )); then
  if forge_run_capture gnome-extensions enable "$FORGE_UUID"; then
    forge_step_ok "Enable"
  else
    forge_step_warn "Enable (will retry after reload)"
  fi
else
  _install_step "Enable" gnome-extensions enable "$FORGE_UUID"
fi

# Rival GNOME Shell tilers (not i3/sway) — install/update must not leave two WMs.
_install_rivals=()
while IFS= read -r _install_line; do
  [[ -n "$_install_line" ]] && _install_rivals+=("$_install_line")
done < <(forge_disable_rival_tilers)
if (( ${#_install_rivals[@]} > 0 )); then
  forge_step_ok "Rival tilers off (${(j:, :)_install_rivals})"
else
  forge_step_ok "Rival tilers (none enabled)"
fi
unset _install_rivals _install_line

if (( DO_HOST_DEFAULTS )) && [[ -f "$SCRIPT_DIR/host-defaults.conf" ]]; then
  if forge_run_capture "$SCRIPT_DIR/apply-host-defaults.zsh" --force "$SCRIPT_DIR/host-defaults.conf"; then
    forge_step_ok "Host defaults"
  else
    forge_step_warn "Host defaults (non-fatal)"
  fi
else
  forge_step_skip "Host defaults"
fi

# Origin + ~/.local/bin/forge (chatter already quiet via FORGE_INSTALL_QUIET).
# write_origin soft-fails CLI conflict; checklist must reflect real symlink.
forge_write_install_origin "$FORGE_REPO_ROOT" git >/dev/null || true
if [[ -f "$FORGE_ORIGIN_PATH" ]] && forge_cli_bin_is_ours; then
  forge_step_ok "CLI"
else
  forge_step_warn "CLI (non-fatal)"
fi

if (( DO_RELOAD_THEME )) && [[ -f "$SCRIPT_DIR/reload-theme.zsh" ]]; then
  if forge_run_capture "$SCRIPT_DIR/reload-theme.zsh" --force; then
    forge_step_ok "Reload theme"
  else
    forge_step_warn "Reload theme (non-fatal)"
  fi
fi

if (( DO_RESTART )); then
  rc=0
  forge_restart_shell || rc=$?
  if (( rc == 0 )); then
    sleep 1
    gnome-extensions enable "$FORGE_UUID" 2>/dev/null || true
    forge_disable_rival_tilers >/dev/null || true
    if (( DO_RELOAD_THEME )) && [[ -f "$SCRIPT_DIR/reload-theme.zsh" ]]; then
      "$SCRIPT_DIR/reload-theme.zsh" --force >/dev/null 2>&1 || true
    fi
    forge_step_ok "Live reload"
  elif (( rc == 2 )); then
    # Expected on Wayland: red X step + one warning line; not a die.
    forge_step_fail "Live reload"
    st=$(forge_session_type)
    if [[ "$st" == "wayland" ]]; then
      forge_warn "must log out and back in to complete install on Wayland"
    else
      forge_warn "must log out and back in to complete install (session=$st)"
    fi
  else
    forge_step_fail "Live reload"
    forge_die "Shell reload failed"
  fi
else
  # Explicit --no-restart: skip only (user opted out; no second warning).
  forge_step_skip "Live reload (--no-restart)"
fi

_install_done
