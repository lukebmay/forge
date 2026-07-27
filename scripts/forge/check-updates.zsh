#!/usr/bin/env zsh
# Check for updates: jcrussell git remote and/or EGO.
# Usage: check-updates.zsh [--ego] [--fetch] [--pull]
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}check-updates.zsh${c_reset} — check jcrussell git and/or EGO for newer Forge

Usage:
  check-updates.zsh [options]

Options:
  --repo=PATH   Git tree to check (default: $FORGE_REPO_ROOT)
  --ego         Also query extensions.gnome.org for latest SweetTooth version
  --fetch       git fetch origin before comparing
  --pull        git pull --ff-only (implies --fetch); does not reinstall
  --install     After pull, run install-jcrussell.zsh (implies --pull)
  --force       Non-interactive for --pull/--install
  --color=auto|always|never
  -h, --help

Exit codes:
  0  up to date (or info only)
  1  error
  2  updates available (git and/or EGO)

$(forge_print_deps_help)
EOF
}

DO_EGO=0
DO_FETCH=0
DO_PULL=0
DO_INSTALL=0
forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --ego) DO_EGO=1; shift ;;
    --fetch) DO_FETCH=1; shift ;;
    --pull) DO_PULL=1; DO_FETCH=1; shift ;;
    --install) DO_INSTALL=1; DO_PULL=1; DO_FETCH=1; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) forge_die "unexpected arg: $1" ;;
  esac
done

forge_need_cmd git
[[ -d "$FORGE_REPO_ROOT/.git" ]] || forge_die "not a git repo: $FORGE_REPO_ROOT"

cd "$FORGE_REPO_ROOT"
avail=0

forge_hdr "jcrussell repo: $FORGE_REPO_ROOT"

local_desc=$(git describe --tags --always --dirty 2>/dev/null || git rev-parse --short HEAD)
branch=$(git rev-parse --abbrev-ref HEAD)
remote=$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null || print "origin/master")
forge_info "HEAD ${c_blue}$local_desc${c_reset} on ${c_cyan}$branch${c_reset} (upstream $remote)"

if (( DO_FETCH )); then
  forge_info "git fetch…"
  git fetch --quiet origin || forge_warn "git fetch failed"
fi

# Compare to upstream if configured
if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  behind=$(git rev-list --count HEAD.."@{u}" 2>/dev/null || print 0)
  ahead=$(git rev-list --count "@{u}"..HEAD 2>/dev/null || print 0)
  if (( behind > 0 )); then
    forge_warn "$behind commit(s) behind $remote"
    git log --oneline "HEAD..@{u}" | head -15
    avail=1
  else
    forge_ok "git branch is up to date with $remote (ahead=$ahead)"
  fi
else
  # fall back to origin default (this fork: master; older clones: main)
  fb=""
  if git rev-parse origin/master >/dev/null 2>&1; then
    fb=origin/master
  elif git rev-parse origin/main >/dev/null 2>&1; then
    fb=origin/main
  fi
  if [[ -n "$fb" ]]; then
    behind=$(git rev-list --count HEAD.."$fb" 2>/dev/null || print 0)
    if (( behind > 0 )); then
      forge_warn "$behind commit(s) behind $fb"
      git log --oneline "HEAD..$fb" | head -15
      avail=1
    else
      forge_ok "in sync with $fb"
    fi
  else
    forge_warn "no upstream tracking branch; run with --fetch after git remote is set"
  fi
fi

# Installed vs repo
if forge_ext_installed; then
  lineage=$(forge_detect_lineage)
  inst_vn=$(forge_metadata_field version-name 2>/dev/null || true)
  inst_v=$(forge_metadata_field version 2>/dev/null || true)
  forge_info "installed: lineage=${c_cyan}$lineage${c_reset} version-name=${c_blue}${inst_vn:-n/a}${c_reset} version=${inst_v:-n/a}"
  if [[ "$lineage" == "jcrussell" && -n "$inst_vn" && "$inst_vn" != "$local_desc" ]]; then
    # dirty suffix may differ
    forge_warn "installed version-name ($inst_vn) ≠ repo describe ($local_desc) — re-run install-jcrussell?"
    avail=1
  fi
else
  forge_info "no extension installed in user dir"
fi

if (( DO_EGO )); then
  forge_need_cmd curl python3
  shell_ver=$(forge_shell_version)
  forge_hdr "EGO (extensions.gnome.org) for shell $shell_ver"
  info=$(curl -fsSL "${FORGE_EGO_API}?uuid=${FORGE_UUID}&shell_version=${shell_ver}" 2>/dev/null) \
    || forge_die "EGO API request failed"
  ego_ver=$(print -r -- "$info" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))')
  ego_tag=$(print -r -- "$info" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version_tag",""))')
  forge_info "EGO latest: version ${c_blue}$ego_ver${c_reset} (tag $ego_tag)"
  if forge_ext_installed && [[ "$(forge_detect_lineage)" == "ego" ]]; then
    cur=$(forge_metadata_field version || print "")
    if [[ -n "$cur" && "$cur" != "$ego_ver" ]]; then
      forge_warn "installed EGO v$cur; EGO has v$ego_ver"
      avail=1
    else
      forge_ok "EGO install matches published v$ego_ver"
    fi
  fi
fi

if (( DO_PULL )); then
  if (( avail )) || [[ "${FORGE_FORCE:-0}" == "1" ]]; then
    if forge_confirm "git pull --ff-only on $FORGE_REPO_ROOT?"; then
      git pull --ff-only
      forge_ok "pull done → $(git describe --tags --always --dirty)"
    fi
  else
    forge_info "nothing to pull"
  fi
fi

if (( DO_INSTALL )); then
  if forge_confirm "Reinstall jcrussell from disk after update?"; then
    # Prefer update path (build+install; user restarts Shell)
    if [[ -x "$SCRIPT_DIR/update-jcrussell.zsh" ]]; then
      "$SCRIPT_DIR/update-jcrussell.zsh" --force
    else
      "$SCRIPT_DIR/install-jcrussell.zsh" --force
    fi
  fi
fi

if (( avail )); then
  forge_warn "updates available (exit 2)"
  exit 2
fi
forge_ok "no updates detected"
exit 0
