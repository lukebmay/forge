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

Default (no flags): build this tree → install extension → enable → reload Shell
on X11 so the new code is ${c_bold}active${c_reset}. Settings are preserved (EGO → full
migrate with backup; already on this lineage → in-place replace).

  none / unknown   → build + install this tree
  jcrussell        → rebuild this tree over the live extension
  ego (SweetTooth) → migrate with settings backup (switch-to-jcrussell)

Records install origin at:
  ${c_cyan}~/.local/share/forge-manage/install-origin.json${c_reset}
so later ${c_blue}forge install${c_reset} re-runs this script from the same repo.

Usage:
  ./install
  ./install [options]
  forge install [options]

Options:
  --repo=PATH         Override repo root (default: this tree)
  --prod              Production build (default: dev/debug)
  --dev               Debug build (default)
  --save              Backup before replace (always on for EGO migrate)
  --no-save           Skip pre-update backup when already jcrussell
  --no-restart        Do not HUP/reload Shell (files only; code stays old until you reload)
  --restart-shell     Same as default (explicit)
  --reload-theme      Stamp/reload user stylesheet after install
  --skip-npm          Skip npm install if node_modules missing
  --no-host-defaults  Skip apply-host-defaults.zsh
  --force             Non-interactive / CI only (skip confirms; not needed on a TTY)
  --color=auto|always|never
  -h, --help

Examples:
  ./install
  ./install --no-restart          # copy files only; reload Shell yourself
  forge install                   # re-run from install-origin
  ./install --force               # pipes / CI

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
[[ -x "$SCRIPT_DIR/install-jcrussell.zsh" || -f "$SCRIPT_DIR/install-jcrussell.zsh" ]] \
  || forge_die "missing install helpers under $SCRIPT_DIR"

lineage="none"
if forge_ext_installed; then
  lineage=$(forge_detect_lineage)
fi

forge_hdr "Forge install (from disk)"
forge_info "repo:     $FORGE_REPO_ROOT"
forge_info "lineage:  $lineage"
forge_info "session:  $(forge_session_type)"
forge_info "mode:     $MODE"
if [[ -d "$FORGE_REPO_ROOT/.git" ]]; then
  forge_info "git:      $(git -C "$FORGE_REPO_ROOT" describe --tags --always --dirty 2>/dev/null || echo n/a)"
fi

# Whether the user passed --force (common args). Needed before we force children.
_USER_FORCE="${FORGE_FORCE:-0}"

case "$lineage" in
  ego)
    forge_info "path: EGO/SweetTooth → switch-to-jcrussell (backup + migrate settings)"
    # Only prompt for EGO migrate (settings path). TTY: ask; non-TTY: need --force.
    if [[ "$_USER_FORCE" != "1" ]]; then
      if forge_is_tty; then
        if ! forge_confirm "Migrate EGO Forge → this tree (backup, build, replace, re-apply settings)?"; then
          forge_die "aborted"
        fi
      else
        forge_die "non-interactive EGO migrate needs --force (will backup + replace extension)"
      fi
    fi
    # Child helpers still call forge_confirm — skip nested prompts after the one above.
    export FORGE_FORCE=1
    args=()
    [[ "$MODE" == "prod" ]] && args+=(--prod)
    if (( DO_RESTART )); then
      args+=(--restart-shell)
    else
      args+=(--no-restart)
    fi
    "$SCRIPT_DIR/switch-to-jcrussell.zsh" --force "${args[@]}"
    forge_write_install_origin "$FORGE_REPO_ROOT" git
    forge_ok "install complete (migrated from EGO)"
    forge_info "status: $SCRIPT_DIR/status.zsh"
    print -r -- "$FORGE_EXT_DIR"
    exit 0
    ;;

  jcrussell)
    forge_info "path: already jcrussell → update in place from this tree"
    # Default: no full dconf backup every day; opt in with --save
    [[ -z "$DO_SAVE" ]] && DO_SAVE=0
    ;;

  none)
    forge_info "path: no extension installed → fresh install from this tree"
    [[ -z "$DO_SAVE" ]] && DO_SAVE=0
    ;;

  unknown|*)
    forge_warn "lineage=$lineage — treating as in-place replace from this tree"
    # Safer default: backup unknown installs
    [[ -z "$DO_SAVE" ]] && DO_SAVE=1
    ;;
esac

# In-place / fresh install is intentional; skip nested confirms in helpers.
export FORGE_FORCE=1

# jcrussell / none / unknown → update-jcrussell or install-jcrussell
args=(--force)
[[ "$MODE" == "prod" ]] && args+=(--prod) || args+=(--dev)
(( SKIP_NPM )) && args+=(--skip-npm)
(( ! DO_HOST_DEFAULTS )) && args+=(--no-host-defaults)
if (( DO_RESTART )); then
  args+=(--restart-shell)
else
  args+=(--no-restart)
fi
(( DO_RELOAD_THEME )) && args+=(--reload-theme)
(( DO_SAVE )) && args+=(--save)

if [[ -f "$SCRIPT_DIR/update-jcrussell.zsh" ]]; then
  "$SCRIPT_DIR/update-jcrussell.zsh" "${args[@]}"
else
  install_args=(--force)
  [[ "$MODE" == "prod" ]] && install_args+=(--prod) || install_args+=(--dev)
  (( SKIP_NPM )) && install_args+=(--skip-npm)
  (( ! DO_HOST_DEFAULTS )) && install_args+=(--no-host-defaults)
  (( DO_SAVE )) && "$SCRIPT_DIR/save-settings.zsh" --force || true
  "$SCRIPT_DIR/install-jcrussell.zsh" "${install_args[@]}"
  if (( DO_RESTART )); then
    forge_restart_shell || true
    gnome-extensions enable "$FORGE_UUID" 2>/dev/null || true
  fi
fi

forge_write_install_origin "$FORGE_REPO_ROOT" git
forge_ok "install complete (lineage=$(forge_detect_lineage))"
if (( DO_RESTART )); then
  st=$(forge_session_type)
  if [[ "$st" == "x11" ]]; then
    forge_ok "Shell reloaded (X11) — extension should be running the new build"
  else
    forge_warn "session=$st: if code looks stale, log out/in (in-session reload not available)"
  fi
else
  forge_warn "files installed; Shell not reloaded (--no-restart). Reload to activate."
fi
forge_info "origin: $FORGE_ORIGIN_PATH"
forge_info "reinstall later: forge install   # or: $FORGE_REPO_ROOT/install"
print -r -- "$FORGE_EXT_DIR"
