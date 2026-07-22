#!/usr/bin/env zsh
# Save current Forge install (extension tree + dconf + ~/.config/forge).
# Usage: save-settings.zsh [--force] [--name=LABEL] [backup-dir]
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}save-settings.zsh${c_reset} — backup Forge settings + installed extension

Usage:
  save-settings.zsh [options] [backup-dir]

Options:
  --name=LABEL     Subdir name under backup root (default: timestamp)
  --no-extension   Skip copying the installed extension tree
  --no-config      Skip ~/.config/forge
  --force          Overwrite existing backup dir
  --backup-root=DIR  Default parent: $FORGE_BACKUP_ROOT
  --color=auto|always|never
  -h, --help

What is saved:
  dconf-forge.conf     dconf dump of $FORGE_DCONF_PATH
  config/              copy of ~/.config/forge (windows.json, CSS colors, …)
  extension/           full installed extension (for rollback)
  gsettings-*.txt      human dump when schemas resolve
  colors-ego.txt       EGO border color keys if present (for jcrussell CSS migrate)
  meta.json            host / version / lineage

$(forge_print_deps_help)
EOF
}

NAME=""
DO_EXT=1
DO_CFG=1
forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --name=*) NAME="${1#--name=}"; shift ;;
    --name) NAME="${2:?}"; shift 2 ;;
    --no-extension) DO_EXT=0; shift ;;
    --no-config) DO_CFG=0; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) break ;;
  esac
done

forge_need_cmd dconf python3

STAMP=$(forge_stamp)
LABEL="${NAME:-$STAMP}"
DEST="${1:-$FORGE_BACKUP_ROOT/$LABEL}"

if [[ -e "$DEST" ]]; then
  if [[ "${FORGE_FORCE:-0}" == "1" ]]; then
    forge_warn "overwriting $DEST"
    rm -rf "$DEST"
  else
    forge_die "backup exists: $DEST (pass --force to overwrite)"
  fi
fi

mkdir -p "$DEST"
forge_hdr "Saving Forge → $DEST"

# Lineage hint for meta
print -r -- "$(forge_detect_lineage)" >"$DEST/meta.lineage"

# dconf (always; works without compiled schemas)
if dconf dump "$FORGE_DCONF_PATH" >"$DEST/dconf-forge.conf" 2>/dev/null; then
  _n=$(grep -c '=' "$DEST/dconf-forge.conf" || true)
  forge_ok "dconf → dconf-forge.conf ($_n keys, $(wc -l <"$DEST/dconf-forge.conf") lines)"
  if (( _n == 0 )); then
    forge_warn "dconf dump has 0 keys — live Forge prefs may already be empty"
  fi
else
  forge_warn "dconf dump failed (empty settings?)"
  : >"$DEST/dconf-forge.conf"
fi

# gsettings human dump (best-effort)
if forge_ext_installed; then
  sd=$(forge_schema_dir || true)
  if [[ -n "${sd:-}" ]]; then
    GSETTINGS_SCHEMA_DIR="$sd" gsettings list-recursively "$FORGE_SCHEMA_MAIN" \
      >"$DEST/gsettings-forge.txt" 2>/dev/null || true
    GSETTINGS_SCHEMA_DIR="$sd" gsettings list-recursively "$FORGE_SCHEMA_KBD" \
      >"$DEST/gsettings-keybindings.txt" 2>/dev/null || true
  fi
fi

if (( DO_CFG )) && [[ -d "$FORGE_CONFIG_DIR" ]]; then
  cp -a "$FORGE_CONFIG_DIR" "$DEST/config"
  forge_ok "config → config/"
  # Highlight stylesheet for theme restore
  if [[ -f "$DEST/config/stylesheet/forge/stylesheet.css" ]]; then
    forge_ok "stylesheet colors included (config/stylesheet/forge/stylesheet.css)"
  else
    forge_warn "no user stylesheet in config (colors may be extension defaults only)"
  fi
else
  forge_info "no config dir (skipped)"
fi

# EGO-only color keys (for migrate → jcrussell CSS when stylesheet was stock)
if [[ -f "$DEST/gsettings-forge.txt" ]]; then
  if grep -qE 'focus-border-color|split-border-color|focus-border-size' "$DEST/gsettings-forge.txt" 2>/dev/null; then
    grep -E 'focus-border-color|split-border-color|focus-border-size' "$DEST/gsettings-forge.txt" \
      >"$DEST/colors-ego.txt" || true
    forge_ok "EGO color keys → colors-ego.txt"
  fi
fi
# Also sniff dconf dump for the same keys
if [[ ! -s "${DEST}/colors-ego.txt" && -f "$DEST/dconf-forge.conf" ]]; then
  if grep -qE 'focus-border-color|split-border-color|focus-border-size' "$DEST/dconf-forge.conf" 2>/dev/null; then
    grep -E 'focus-border-color|split-border-color|focus-border-size' "$DEST/dconf-forge.conf" \
      >"$DEST/colors-ego.txt" || true
    forge_ok "EGO color keys from dconf → colors-ego.txt"
  fi
fi

if (( DO_EXT )) && forge_ext_installed; then
  cp -a "$FORGE_EXT_DIR" "$DEST/extension"
  forge_ok "extension → extension/"
else
  forge_warn "extension not installed or --no-extension"
fi

forge_write_meta "$DEST" >/dev/null
rm -f "$DEST/meta.lineage"
forge_ok "meta.json written"

# Convenience pointer to latest
mkdir -p "$FORGE_BACKUP_ROOT"
ln -sfn "$DEST" "$FORGE_BACKUP_ROOT/latest"
print -r -- "$DEST"
forge_ok "done (latest → $FORGE_BACKUP_ROOT/latest)"
