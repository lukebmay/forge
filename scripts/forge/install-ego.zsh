#!/usr/bin/env zsh
# Install Forge from extensions.gnome.org (SweetTooth / EGO).
# Usage: install-ego.zsh [--version-tag=PK] [--force]
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}install-ego.zsh${c_reset} — install Forge from extensions.gnome.org

Usage:
  install-ego.zsh [options]

Options:
  --version-tag=PK   EGO version_tag (pk); default: best match for this shell
  --shell=VER        GNOME Shell major version for API lookup (default: auto)
  --keep-zip         Keep downloaded zip in cache
  --force            Replace existing install; non-interactive
  --color=auto|always|never
  -h, --help

Notes:
  • UUID is always $FORGE_UUID (same as this tree) — this *replaces* the live extension.
  • Save settings first: save-settings.zsh
  • After install: log out/in (X11: Alt+F2 r may work), then:
      gnome-extensions enable $FORGE_UUID

Cache: ~/.cache/forge-manage/

$(forge_print_deps_help)
EOF
}

VERSION_TAG=""
SHELL_VER=""
KEEP_ZIP=0
forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --version-tag=*) VERSION_TAG="${1#--version-tag=}"; shift ;;
    --version-tag) VERSION_TAG="${2:?}"; shift 2 ;;
    --shell=*) SHELL_VER="${1#--shell=}"; shift ;;
    --shell) SHELL_VER="${2:?}"; shift 2 ;;
    --keep-zip) KEEP_ZIP=1; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) forge_die "unexpected arg: $1" ;;
  esac
done

forge_need_cmd curl python3 gnome-extensions unzip

SHELL_VER="${SHELL_VER:-$(forge_shell_version)}"
CACHE="$HOME/.cache/forge-manage"
mkdir -p "$CACHE"

forge_hdr "Install Forge from EGO (shell $SHELL_VER)"

info_tmp=$(mktemp)
curl -fsSL "${FORGE_EGO_API}?uuid=${FORGE_UUID}&shell_version=${SHELL_VER}" >"$info_tmp"
eval "$(python3 - "$info_tmp" "$VERSION_TAG" <<'PY'
import json, sys, shlex
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text())
force_tag = sys.argv[2] or ""
tag = force_tag or str(data.get("version_tag") or "")
ver = data.get("version")
dl = data.get("download_url") or ""
if force_tag:
    dl = f"/download-extension/forge@jmmaranan.com.shell-extension.zip?version_tag={force_tag}"
print(f"EGO_VERSION={shlex.quote(str(ver))}")
print(f"EGO_TAG={shlex.quote(str(tag))}")
print(f"EGO_DL={shlex.quote(str(dl))}")
print(f"EGO_NAME={shlex.quote(str(data.get('name', '')))}")
PY
)"
rm -f "$info_tmp"

[[ -n "$EGO_TAG" && -n "$EGO_DL" ]] || forge_die "could not resolve EGO download for shell $SHELL_VER"

forge_info "EGO version ${c_blue}$EGO_VERSION${c_reset} (tag $EGO_TAG)"
ZIP="$CACHE/forge-ego-v${EGO_VERSION}-tag${EGO_TAG}.zip"
URL="${FORGE_EGO_BASE}${EGO_DL}"

if [[ ! -f "$ZIP" ]]; then
  forge_info "downloading $URL"
  curl -fsSL -o "$ZIP.partial" "$URL"
  mv "$ZIP.partial" "$ZIP"
else
  forge_info "using cached $ZIP"
fi

if forge_ext_installed; then
  forge_warn "replacing existing install at $FORGE_EXT_DIR (lineage=$(forge_detect_lineage))"
  if ! forge_confirm "Replace installed Forge with EGO v$EGO_VERSION?"; then
    forge_die "aborted"
  fi
  # Unload before zip/dir replace (shared UUID).
  forge_disable_extension "$FORGE_UUID" >/dev/null || true
fi

# Prefer gnome-extensions install --force when available
if gnome-extensions install --help 2>&1 | grep -q -- '--force'; then
  gnome-extensions install --force "$ZIP"
else
  # Manual install (disable already attempted when replacing)
  forge_disable_extension "$FORGE_UUID" >/dev/null || true
  rm -rf "$FORGE_EXT_DIR"
  mkdir -p "$FORGE_EXT_DIR"
  unzip -q -o "$ZIP" -d "$FORGE_EXT_DIR"
fi

(( KEEP_ZIP )) || true  # keep by default in cache; user can delete

forge_ok "EGO Forge v$EGO_VERSION installed → $FORGE_EXT_DIR"
forge_warn "Restart GNOME Shell / log out+in, then: gnome-extensions enable $FORGE_UUID"
print -r -- "$FORGE_EXT_DIR"
