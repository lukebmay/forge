#!/usr/bin/env zsh
# Build and/or install this repo into the live Forge extension.
# Prefer: build while old extension still installed, then install-only after uninstall.
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}build-install.zsh${c_reset} — build/install Forge from this git tree

Prefer root ${c_blue}./install${c_reset} or ${c_blue}forge install${c_reset} for the full path.
This helper is the low-level build + copy step.

Usage:
  build-install.zsh [options]

Options:
  --repo=PATH      Repo root (default: $FORGE_REPO_ROOT)
  --prod           Release-style build (production=true → logging OFF)
  --dev            Debug build (production=false) — default; sets log-level=TRACE
  --build-only     npm/make build (+ debug) into repo temp/; do NOT install
  --install-only   Copy existing temp/ into extension dir (no rebuild)
  --skip-npm       Skip npm install even if node_modules missing
  --no-enable      Do not run gnome-extensions enable after install
  --no-host-defaults  Skip apply-host-defaults.zsh after install
  --force          Non-interactive replace of current install
  --verbose, -v    Detailed build/install logs
  --color=auto|always|never
  -h, --help

On X11, replace disables $FORGE_UUID first, then rm + copy temp/. On Wayland,
install never disables/enables a live extension (files overlay only) — tip loads
via nest or a later logout (D048).

Safe migrate order (EGO → this tree):
  1. build-install.zsh --build-only     # old Forge still running
  2. uninstall.zsh                      # disable + remove code only
  3. build-install.zsh --install-only   # copies verified temp/

Requirements:
  • Node.js 20+
  • npm, make, gettext (msgfmt), glib-compile-schemas

$(forge_print_deps_help)
EOF
}

MODE="dev"
SKIP_NPM=0
DO_ENABLE=1
DO_HOST_DEFAULTS=1
BUILD_ONLY=0
INSTALL_ONLY=0
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
    --build-only) BUILD_ONLY=1; shift ;;
    --install-only) INSTALL_ONLY=1; shift ;;
    --skip-npm) SKIP_NPM=1; shift ;;
    --no-enable) DO_ENABLE=0; shift ;;
    --no-host-defaults) DO_HOST_DEFAULTS=0; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) forge_die "unexpected arg: $1" ;;
  esac
done

if (( BUILD_ONLY && INSTALL_ONLY )); then
  forge_die "use only one of --build-only / --install-only"
fi

forge_need_cmd make

[[ -f "$FORGE_REPO_ROOT/Makefile" ]] || forge_die "not a forge repo: $FORGE_REPO_ROOT"
[[ -f "$FORGE_REPO_ROOT/metadata.json" ]] || forge_die "missing metadata.json in $FORGE_REPO_ROOT"

forge_verify_temp_build() {
  local t="$FORGE_REPO_ROOT/temp"
  [[ -d "$t" ]] || forge_die "temp/ missing — run without --install-only first"
  [[ -f "$t/extension.js" && -f "$t/metadata.json" && -f "$t/schemas/gschemas.compiled" ]] \
    || forge_die "temp/ incomplete (need extension.js, metadata.json, schemas/gschemas.compiled)"
  local lines vn
  lines=$(wc -l <"$t/extension.js")
  (( lines > 150 )) || forge_die "temp/extension.js looks too small ($lines lines) — build failed?"
  vn=$(forge_metadata_field version-name "$t/metadata.json" || true)
  [[ -n "$vn" ]] || forge_warn "temp/metadata.json has no version-name (unexpected for this tree)"
  forge_ok "temp/ build OK (extension.js $lines lines, version-name=${vn:-none})"
}

forge_do_build() {
  forge_need_cmd node npm
  local node_major
  node_major=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || print 0)
  if (( node_major < 20 )); then
    forge_die "Node.js 20+ required (found $(node -v)). Use nvm/n/fnm or install Node 20+."
  fi

  forge_hdr "Build Forge in $FORGE_REPO_ROOT"
  forge_info "mode: $MODE | node $(node -v)"

  cd "$FORGE_REPO_ROOT"

  if (( ! SKIP_NPM )) && [[ ! -d node_modules ]]; then
    forge_info "npm install…"
    npm install
  elif (( ! SKIP_NPM )); then
    forge_info "node_modules present"
  fi

  forge_info "make check-deps…"
  make check-deps

  forge_info "make build…"
  make build

  if [[ "$MODE" == "dev" ]]; then
    forge_info "make debug (production=false)…"
    make debug
  fi

  forge_verify_temp_build

  # Prove new schemas can resolve (and can read existing dconf if any)
  if command -v gsettings >/dev/null 2>&1; then
    local n
    n=$(GSETTINGS_SCHEMA_DIR="$FORGE_REPO_ROOT/temp/schemas" \
      gsettings list-keys "$FORGE_SCHEMA_MAIN" 2>/dev/null | wc -l || true)
    forge_info "temp schema keys (main): $n"
    (( n > 10 )) || forge_die "temp schemas not usable via gsettings"
  fi
}

forge_do_install() {
  forge_verify_temp_build

  local _replace_lineage="none" _dis_st _was_enabled=0
  if forge_ext_enabled; then
    _was_enabled=1
  fi
  if forge_ext_installed; then
    if ! forge_confirm "Replace installed Forge with built temp/?"; then
      forge_die "aborted"
    fi
    _replace_lineage=$(forge_detect_lineage)
    if forge_live_extension_cycle_ok; then
      _dis_st=$(forge_disable_extension "$FORGE_UUID" || true)
      forge_info "pre-replace disable: $_dis_st (lineage=$_replace_lineage)"
    else
      forge_info "pre-replace: skip live disable (session=$(forge_session_type); tip deferred)"
    fi
  fi

  forge_hdr "Install temp/ → $FORGE_EXT_DIR"
  cd "$FORGE_REPO_ROOT"
  forge_install_temp_to_ext_dir || forge_die "install failed: could not copy temp/ → $FORGE_EXT_DIR"

  [[ -f "$FORGE_EXT_DIR/extension.js" ]] || forge_die "install failed: no extension.js"
  forge_ok "installed lineage=$(forge_detect_lineage)"
  if [[ -f "$FORGE_EXT_DIR/metadata.json" ]]; then
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("version-name:", d.get("version-name","(none)")); print("shell-version:", d.get("shell-version"))' \
      "$FORGE_EXT_DIR/metadata.json"
  fi

  if (( DO_ENABLE )); then
    if (( _was_enabled )) && ! forge_live_extension_cycle_ok; then
      forge_ok "left enabled (live cycle skipped; tip still previous until nest/logout)"
    elif forge_enable_extension "$FORGE_UUID"; then
      forge_ok "enabled $FORGE_UUID"
    else
      forge_warn "enable failed — clear session block, then: gnome-extensions enable $FORGE_UUID"
      forge_warn "  gsettings set org.gnome.shell disable-user-extensions false"
    fi
    _bi_rivals=()
    while IFS= read -r _bi_line; do
      [[ -n "$_bi_line" ]] && _bi_rivals+=("$_bi_line")
    done < <(forge_disable_rival_tilers)
    if (( ${#_bi_rivals[@]} > 0 )); then
      forge_ok "disabled rival tilers: ${(j:, :)_bi_rivals}"
    fi
    unset _bi_rivals _bi_line
  fi

  if (( DO_HOST_DEFAULTS )) && [[ -f "$SCRIPT_DIR/host-defaults.conf" ]]; then
    forge_info "applying host keyboard defaults…"
    "$SCRIPT_DIR/apply-host-defaults.zsh" --force "$SCRIPT_DIR/host-defaults.conf" || \
      forge_warn "host-defaults apply failed (non-fatal)"
  fi

  # Dev install: TRACE so the independent forge.log gets hot-path detail.
  # Journal stays INFO+ only (D050). Production builds stay quiet via
  # production=true even if these keys are set.
  if [[ "$MODE" == "dev" ]] && command -v gsettings >/dev/null 2>&1; then
    if gsettings set org.gnome.shell.extensions.forge logging-enabled true 2>/dev/null \
      && gsettings set org.gnome.shell.extensions.forge log-level 6 2>/dev/null; then
      forge_ok "dev logging: enabled, log-level=6 (TRACE → forge.log; journal INFO+)"
    else
      forge_warn "could not set dev log-level via gsettings (schemas may need reload)"
    fi
  fi

  forge_write_install_origin "$FORGE_REPO_ROOT" git || \
    forge_warn "could not write install-origin (non-fatal)"
}

if (( BUILD_ONLY )); then
  forge_do_build
  forge_ok "build-only complete — extension NOT installed yet"
  print -r -- "$FORGE_REPO_ROOT/temp"
  exit 0
fi

if (( INSTALL_ONLY )); then
  forge_do_install
  if forge_live_extension_cycle_ok; then
    forge_warn "Shell may still show stale Version until HUP (killall -HUP gnome-shell)."
  else
    forge_warn "Files installed; host tip deferred (nest or later logout). Install does not unload live Shell."
  fi
  print -r -- "$FORGE_EXT_DIR"
  exit 0
fi

# Full path: build then install (legacy convenience; migrate script prefers split)
forge_do_build
if [[ "$MODE" == "prod" && $DO_ENABLE -eq 1 ]]; then
  # make prod also restarts shell — keep parity only when full prod requested without split
  forge_info "make install + enable (prod path uses makefile install only; no auto-restart here)"
fi
forge_do_install
forge_warn "If Shell still shows old code: log out/in or X11: killall -HUP gnome-shell"
print -r -- "$FORGE_EXT_DIR"
