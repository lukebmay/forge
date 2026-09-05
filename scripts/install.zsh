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

Default (no flags): build → install files → enable if needed → rival tilers →
host defaults → CLI. On ${c_bold}X11${c_reset}: may disable → replace → HUP Shell.
On ${c_bold}Wayland${c_reset}: ${c_bold}never${c_reset} disable/enable a live Forge
(files overlay only) — tip loads via nest or a later logout (D048). Quiet
checklist UX (no prompts for routine paths).

Replaces any prior EGO / jcrussell / luke / unknown install of the same UUID
(${c_cyan}forge@jmmaranan.com${c_reset}). ${c_blue}forge update${c_reset} uses this path.

Disables other GNOME Shell tiling extensions (Tiling Assistant, Pop Shell,
PaperWM, …) so they cannot fight Forge. Does not touch session WMs (i3/sway).

  none               → build + install this tree
  luke / jcrussell   → rebuild this tree over the live extension dir
  unknown            → replace (backup by default)
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
  --prod              Production build (production=true) + log-level=WARN
  --dev               Debug build + TRACE + layout overlay + forge-test on PATH
  --dev=MODES         Same as --dev plus comma modes (strict-geometry, geom-epsilon-measure,
                      fault-inject-geometry, geom-trace). Legacy --dev leaves modes empty.
  --save              Backup before replace (always on for EGO migrate)
  --no-save           Skip pre-update backup when already luke/jcrussell
  --no-restart        Skip X11 HUP (files only). Wayland never HUPs/logouts anyway
  --restart-shell     X11: HUP after install. Wayland: still files-only (no session end)
  --reload-theme      Stamp/reload user stylesheet after install (default)
  --no-reload-theme   Skip css-last-update stamp / css-updated bump
  --skip-npm          Skip npm install if node_modules missing
  --no-host-defaults  Skip apply-host-defaults.zsh
  --kit=vim|safe|i3   Load that built-in keybind kit into live gsettings
  --no-kit            Do not load a kit (default). Still warns if live is custom
  --with-test-cli     Symlink ~/.local/bin/forge-test (implied by --dev; still opt-in for regular)
  --force             Non-interactive (default for this script; kept for CI flags)
  --verbose, -v       Detailed logs (make/npm/gsettings chatter)
  --color=auto|always|never
  -h, --help

Env:
  FORGE_VERBOSE=1     Same as --verbose

Examples:
  ./install
  ./install --no-restart          # X11: skip HUP; Wayland: same as default files-only
  ./install --verbose             # full build chatter
  ./install --kit=vim             # daily: install + load Vim kit
  ./install --dev=strict-geometry # TRACE + gate opportunistic geometry heals
  forge install                   # re-run from install-origin
  forge install --kit=vim

$(forge_print_deps_help)
EOF
}

MODE="regular" # production=false + INFO; --dev → TRACE; --prod → production=true + WARN
FORGE_DEV_MODES_CSV=""
FORGE_DEV_MODES_GSETTINGS="@as []"
DO_SAVE="" # empty = default by lineage
# X11 default: HUP after install. Wayland: never ends the session (D048).
DO_RESTART=1
# Always stamp css-last-update + bump css-updated so user overrides reload
# after HUP (otherwise dual-load can leave bundled base colors looking "wiped").
DO_RELOAD_THEME=1
DO_HOST_DEFAULTS=1
SKIP_NPM=0
KIT=""
WITH_TEST_CLI=0

forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --prod) MODE="prod"; FORGE_DEV_MODES_CSV=""; FORGE_DEV_MODES_GSETTINGS="@as []"; shift ;;
    --dev)
      MODE="dev"
      WITH_TEST_CLI=1
      forge_parse_dev_modes_csv ""
      shift
      ;;
    --dev=*)
      MODE="dev"
      WITH_TEST_CLI=1
      forge_parse_dev_modes_csv "${1#--dev=}"
      shift
      ;;
    --regular) MODE="regular"; FORGE_DEV_MODES_CSV=""; FORGE_DEV_MODES_GSETTINGS="@as []"; shift ;;
    --save) DO_SAVE=1; shift ;;
    --no-save) DO_SAVE=0; shift ;;
    --no-restart|--no-restart-shell) DO_RESTART=0; shift ;;
    --restart-shell) DO_RESTART=1; shift ;;
    --reload-theme) DO_RELOAD_THEME=1; shift ;;
    --no-reload-theme) DO_RELOAD_THEME=0; shift ;;
    --no-host-defaults) DO_HOST_DEFAULTS=0; shift ;;
    --skip-npm) SKIP_NPM=1; shift ;;
    --kit=*) KIT="${1#--kit=}"; shift ;;
    --kit)
      KIT="${2:-}"
      [[ -n "$KIT" ]] || forge_die "--kit needs vim|safe|i3"
      shift 2
      ;;
    --no-kit) KIT=""; shift ;;
    --with-test-cli) WITH_TEST_CLI=1; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) forge_die "unexpected arg: $1" ;;
  esac
done

if [[ -n "$KIT" ]]; then
  case "$KIT" in
    vim|safe|i3) ;;
    *) forge_die "--kit must be vim, safe, or i3 (got ${KIT})" ;;
  esac
fi

[[ -f "$FORGE_REPO_ROOT/Makefile" && -f "$FORGE_REPO_ROOT/metadata.json" ]] \
  || forge_die "not a forge repo: $FORGE_REPO_ROOT"
forge_refuse_ephemeral_repo "$FORGE_REPO_ROOT"
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

_install_keybind_kit() {
  local mjs="$FORGE_REPO_ROOT/cli/keybind.mjs"
  if ! command -v node >/dev/null 2>&1; then
    forge_step_warn "Keybind kit (node missing)"
    return 0
  fi
  if [[ ! -f "$mjs" ]]; then
    forge_step_warn "Keybind kit (script missing)"
    return 0
  fi
  if [[ -n "$KIT" ]]; then
    if forge_run_quiet node "$mjs" load "$KIT"; then
      forge_step_ok "Keybind kit ($KIT)"
    else
      forge_step_warn "Keybind kit ($KIT load failed)"
    fi
    return 0
  fi
  local st=0 json matched
  json=$(node "$mjs" status --json) || st=$?
  if (( st == 0 )); then
    matched=$(print -r -- "$json" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{console.log(JSON.parse(s).matched||"")}catch{console.log("")}})')
    forge_step_ok "Keybind kit (${matched:-ok})"
  elif (( st == 2 )); then
    forge_step_warn "Keybind kit (custom; ./install --kit=vim)"
  else
    forge_step_warn "Keybind kit (status failed)"
  fi
}

print -u2 -- "${c_bold}forge install${c_reset}"

case "$lineage" in
  ego)
    print -u2 -- "  ${c_cyan}note:${c_reset} migrating EGO → this tree (auto-backup)"
    args=(--force)
    [[ "$MODE" == "prod" ]] && args+=(--prod)
    forge_append_dev_mode_arg args "$MODE" "$FORGE_DEV_MODES_CSV"
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
    _install_keybind_kit
    if (( DO_RESTART )) && forge_live_extension_cycle_ok; then
      forge_step_ok "Live reload"
    elif (( DO_RESTART )); then
      forge_step_skip "Live reload (Wayland: tip deferred; nest or later logout)"
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
[[ "$MODE" == "prod" ]] && build_args+=(--prod)
forge_append_dev_mode_arg build_args "$MODE" "$FORGE_DEV_MODES_CSV"
[[ "$MODE" == "regular" ]] && build_args+=(--regular)
(( SKIP_NPM )) && build_args+=(--skip-npm)
_install_step "Build" "$SCRIPT_DIR/build-install.zsh" "${build_args[@]}"

_was_enabled=0
forge_ext_enabled && _was_enabled=1

# X11: unload before replace. Wayland: never cycle a live extension (D048).
if [[ "$lineage" != "none" ]] && forge_live_extension_cycle_ok; then
  _dis_st=$(forge_disable_extension "$FORGE_UUID" || true)
  case "$_dis_st" in
    disabled|already-off|not-installed)
      forge_step_ok "Disable previous ($lineage)"
      ;;
    skip)
      forge_step_warn "Disable previous ($lineage) — gnome-extensions missing"
      ;;
    *)
      forge_step_warn "Disable previous ($lineage) (${_dis_st:-fail})"
      ;;
  esac
  unset _dis_st
elif [[ "$lineage" != "none" ]]; then
  forge_step_skip "Disable previous ($lineage; live cycle skipped)"
fi

install_args=(--force --install-only --no-enable --no-host-defaults)
[[ "$MODE" == "prod" ]] && install_args+=(--prod)
forge_append_dev_mode_arg install_args "$MODE" "$FORGE_DEV_MODES_CSV"
[[ "$MODE" == "regular" ]] && install_args+=(--regular)
_install_step "Install extension" "$SCRIPT_DIR/build-install.zsh" "${install_args[@]}"

# Clear GNOME post-crash session block (disable-user-extensions) before enable.
_block_st=$(forge_clear_shell_extension_block "$FORGE_UUID" 2>/dev/null || print fail)
case "$_block_st" in
  cleared|cleared:*)
    forge_step_ok "Session block cleared ($_block_st)"
    ;;
  fail)
    forge_step_warn "Session block clear failed (check dconf locks)"
    ;;
  *)
    forge_step_ok "Session block clear"
    ;;
esac
unset _block_st

# Enable only when needed. Never disable→enable a live Wayland Forge.
if (( _was_enabled )) && ! forge_live_extension_cycle_ok; then
  forge_step_ok "Enable (left live; tip deferred)"
elif (( DO_RESTART )) && forge_live_extension_cycle_ok; then
  if forge_run_capture forge_enable_extension "$FORGE_UUID"; then
    forge_step_ok "Enable"
  else
    forge_step_warn "Enable (will retry after reload)"
  fi
else
  if forge_enable_extension "$FORGE_UUID"; then
    forge_step_ok "Enable"
  else
    forge_step_fail "Enable"
    forge_warn "try: gsettings set org.gnome.shell disable-user-extensions false"
    forge_warn "then: gnome-extensions enable $FORGE_UUID"
  fi
fi
unset _was_enabled

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
if (( WITH_TEST_CLI )); then
  if forge_install_test_cli_bin; then
    forge_step_ok "Test CLI"
  else
    forge_step_warn "Test CLI (non-fatal)"
  fi
fi

_install_keybind_kit

if (( DO_RELOAD_THEME )) && [[ -f "$SCRIPT_DIR/reload-theme.zsh" ]]; then
  if forge_run_capture "$SCRIPT_DIR/reload-theme.zsh" --force; then
    forge_step_ok "Reload theme"
  else
    forge_step_warn "Reload theme (non-fatal)"
  fi
fi

if (( DO_RESTART )) && forge_live_extension_cycle_ok; then
  rc=0
  forge_restart_shell || rc=$?
  if (( rc == 0 )); then
    sleep 1
    forge_enable_extension "$FORGE_UUID" >/dev/null 2>&1 || true
    forge_disable_rival_tilers >/dev/null || true
    if (( DO_RELOAD_THEME )) && [[ -f "$SCRIPT_DIR/reload-theme.zsh" ]]; then
      "$SCRIPT_DIR/reload-theme.zsh" --force >/dev/null 2>&1 || true
    fi
    forge_step_ok "Live reload"
  else
    forge_step_fail "Live reload"
    forge_die "Shell reload failed"
  fi
elif (( DO_RESTART )); then
  forge_step_skip "Live reload (Wayland: tip deferred; nest or later logout)"
else
  forge_step_skip "Live reload (--no-restart)"
fi

_install_done
