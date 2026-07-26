#!/usr/bin/env zsh
# Shared helpers for scripts/forge/*.zsh — source only, not run directly.
emulate -L zsh
set -euo pipefail

FORGE_UUID="${FORGE_UUID:-forge@jmmaranan.com}"
FORGE_SCHEMA_MAIN="${FORGE_SCHEMA_MAIN:-org.gnome.shell.extensions.forge}"
FORGE_SCHEMA_KBD="${FORGE_SCHEMA_KBD:-org.gnome.shell.extensions.forge.keybindings}"
FORGE_DCONF_PATH="${FORGE_DCONF_PATH:-/org/gnome/shell/extensions/forge/}"
FORGE_EXT_DIR="${FORGE_EXT_DIR:-$HOME/.local/share/gnome-shell/extensions/$FORGE_UUID}"
FORGE_CONFIG_DIR="${FORGE_CONFIG_DIR:-$HOME/.config/forge}"
FORGE_BACKUP_ROOT="${FORGE_BACKUP_ROOT:-$HOME/.local/share/forge-manage/backups}"
FORGE_MANAGE_DIR="${FORGE_MANAGE_DIR:-$HOME/.local/share/forge-manage}"
# Survives extension replace; used by `forge install` to find the git tree.
FORGE_ORIGIN_PATH="${FORGE_ORIGIN_PATH:-$FORGE_MANAGE_DIR/install-origin.json}"
# User-facing CLI on PATH (XDG user bin).
FORGE_CLI_BIN_DIR="${FORGE_CLI_BIN_DIR:-$HOME/.local/bin}"
FORGE_CLI_BIN="${FORGE_CLI_BIN:-$FORGE_CLI_BIN_DIR/forge}"
FORGE_EGO_UUID="${FORGE_EGO_UUID:-$FORGE_UUID}"
FORGE_EGO_API="${FORGE_EGO_API:-https://extensions.gnome.org/extension-info/}"
FORGE_EGO_BASE="${FORGE_EGO_BASE:-https://extensions.gnome.org}"

# Repo root: this file lives at scripts/forge/_lib.zsh
# (do not assign to $0 — it breaks command lookup in some zsh builds)
_forge_lib_file=${(%):-%N}
FORGE_SCRIPTS_DIR="${FORGE_SCRIPTS_DIR:-${_forge_lib_file:A:h}}"
FORGE_REPO_ROOT="${FORGE_REPO_ROOT:-${FORGE_SCRIPTS_DIR:h:h}}"
unset _forge_lib_file

FORGE_VERSION="1.0.0"
FORGE_COLOR="${FORGE_COLOR:-auto}"

# --- ANSI ---
_forge_use_color() {
  case "$FORGE_COLOR" in
    always) return 0 ;;
    never) return 1 ;;
    auto|*) [[ -t 1 ]] && [[ -t 0 || ! -p /dev/stdout ]] ;;
  esac
}

if _forge_use_color; then
  c_reset=$'\e[0m'
  c_bold=$'\e[1m'
  c_red=$'\e[31m'
  c_green=$'\e[32m'
  c_yellow=$'\e[33m'
  c_blue=$'\e[34m'
  c_magenta=$'\e[35m'
  c_cyan=$'\e[36m'
else
  c_reset= c_bold= c_red= c_green= c_yellow= c_blue= c_magenta= c_cyan=
fi

forge_die() { print -u2 -- "${c_red}forge: $*${c_reset}"; exit 1; }
forge_warn() { print -u2 -- "${c_yellow}forge: $*${c_reset}"; }
forge_info() { print -u2 -- "${c_cyan}forge: $*${c_reset}"; }
forge_ok() { print -u2 -- "${c_green}forge: $*${c_reset}"; }
forge_hdr() { print -u2 -- "${c_magenta}${c_bold}$*${c_reset}"; }

forge_is_tty() { [[ -t 0 && -t 1 ]]; }

forge_confirm() {
  # $1 prompt; default yes unless FORGE_CONFIRM_DEFAULT=no
  local prompt="$1" def="${FORGE_CONFIRM_DEFAULT:-yes}" ans
  if ! forge_is_tty; then
    [[ "${FORGE_FORCE:-0}" == "1" ]] && return 0
    forge_die "non-interactive; pass --force or set FORGE_FORCE=1 ($prompt)"
  fi
  local hint="[Y/n]"
  [[ "$def" == "no" ]] && hint="[y/N]"
  print -n -- "${c_yellow}$prompt $hint ${c_reset}"
  read -r ans || ans=""
  ans="${ans:l}"
  if [[ -z "$ans" ]]; then
    [[ "$def" == "yes" ]] && return 0 || return 1
  fi
  [[ "$ans" == "y" || "$ans" == "yes" ]]
}

forge_need_cmd() {
  local c
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || {
      print -u2 -- "${c_red}forge: \`$c\` not found${c_reset}"
      print -u2 -- "Install the missing tool, then re-run."
      exit 127
    }
  done
}

forge_stamp() { date +%Y%m%d-%H%M%S; }

forge_shell_version() {
  # major only, e.g. 46
  local v
  v=$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+' | head -1) || true
  print -r -- "${v:-46}"
}

forge_session_type() {
  print -r -- "${XDG_SESSION_TYPE:-unknown}"
}

# Reload GNOME Shell so a replaced extension is actually loaded.
# X11: killall -HUP. Wayland: cannot in-session restart — returns 2.
# Returns 0 on HUP sent, 1 on failure, 2 if session needs logout.
forge_restart_shell() {
  local st
  st=$(forge_session_type)
  # Best-effort flush so install HUP can restore splits/tabs (disable may not run).
  if [[ -x "${FORGE_SCRIPTS_DIR:-$SCRIPT_DIR}/forge" ]]; then
    forge_info "flushing session layout before Shell reload…"
    "${FORGE_SCRIPTS_DIR:-$SCRIPT_DIR}/forge" save-session-layout 2>/dev/null \
      || forge_warn "session-layout flush skipped (extension offline or old build)"
  fi
  case "$st" in
    x11)
      if ! command -v killall >/dev/null 2>&1; then
        forge_warn "killall not found; restart Shell manually (Alt+F2 → r)"
        return 1
      fi
      forge_info "restarting GNOME Shell (X11 HUP)…"
      if killall -HUP gnome-shell 2>/dev/null; then
        sleep 2
        return 0
      fi
      forge_warn "HUP failed — try Alt+F2 → r, or log out"
      return 1
      ;;
    wayland)
      forge_warn "Wayland: log out and back in to load the new extension code"
      return 2
      ;;
    *)
      forge_warn "session=$st: log out/in (or X11: killall -HUP gnome-shell) to load new code"
      return 2
      ;;
  esac
}

forge_ext_installed() {
  [[ -d "$FORGE_EXT_DIR" && -f "$FORGE_EXT_DIR/metadata.json" ]]
}

forge_ext_enabled() {
  gnome-extensions list --enabled 2>/dev/null | grep -qx "$FORGE_UUID"
}

forge_metadata_field() {
  # $1 field name from metadata.json of installed extension
  # NOTE: never name a local `path` — zsh ties path[] ↔ PATH.
  local field="$1" meta="${2:-$FORGE_EXT_DIR/metadata.json}"
  [[ -f "$meta" ]] || return 1
  python3 -c '
import json, sys
from pathlib import Path
p, k = sys.argv[1], sys.argv[2]
try:
    d = json.loads(Path(p).read_text())
except Exception:
    sys.exit(1)
v = d.get(k, "")
if isinstance(v, list):
    print(",".join(str(x) for x in v))
else:
    print("" if v is None else v)
' "$meta" "$field"
}

forge_detect_lineage() {
  # ego | jcrussell | unknown
  # Prefer version-name (git describe stamped by this tree's make build).
  # EGO/SweetTooth stamps numeric "version" and often "_generated".
  # Note: both trees may have lib/extension — do not use layout alone.
  local meta="$FORGE_EXT_DIR/metadata.json" version_name version
  forge_ext_installed || { print -r -- "none"; return 0; }
  version_name=$(forge_metadata_field version-name "$meta" 2>/dev/null || true)
  if [[ -n "$version_name" ]]; then
    print -r -- "jcrussell"
    return 0
  fi
  if grep -q 'Generated by SweetTooth' "$meta" 2>/dev/null; then
    print -r -- "ego"
    return 0
  fi
  version=$(forge_metadata_field version "$meta" 2>/dev/null || true)
  if [[ -n "$version" && "$version" == <-> ]]; then
    print -r -- "ego"
    return 0
  fi
  print -r -- "unknown"
}

forge_schema_dir() {
  local d="$FORGE_EXT_DIR/schemas"
  [[ -d "$d" ]] && print -r -- "$d" && return 0
  d="$FORGE_REPO_ROOT/schemas"
  [[ -d "$d" ]] && print -r -- "$d" && return 0
  return 1
}

forge_with_schema() {
  # run command with GSETTINGS_SCHEMA_DIR pointing at forge schemas
  local sd
  sd=$(forge_schema_dir) || forge_die "no schemas dir (install forge or use repo schemas/)"
  GSETTINGS_SCHEMA_DIR="$sd" "$@"
}

forge_latest_backup() {
  local d
  [[ -d "$FORGE_BACKUP_ROOT" ]] || return 1
  d=$(ls -1d "$FORGE_BACKUP_ROOT"/*/ 2>/dev/null | sort | tail -1) || return 1
  [[ -n "$d" ]] || return 1
  print -r -- "${d%/}"
}

forge_write_meta() {
  # $1 backup dir
  local dest="$1"
  python3 - "$dest" <<'PY'
import json, os, platform, subprocess, sys, time
from pathlib import Path
dest = Path(sys.argv[1])
meta_path = dest / "meta.json"
ext_meta = Path(os.path.expanduser("~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/metadata.json"))
installed = {}
if ext_meta.is_file():
    try:
        installed = json.loads(ext_meta.read_text())
    except Exception:
        pass
shell = ""
try:
    shell = subprocess.check_output(["gnome-shell", "--version"], text=True).strip()
except Exception:
    pass
lineage = "unknown"
if (dest / "meta.lineage").is_file():
    lineage = (dest / "meta.lineage").read_text().strip()
data = {
    "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    "host": platform.node(),
    "user": os.environ.get("USER", ""),
    "session_type": os.environ.get("XDG_SESSION_TYPE", ""),
    "gnome_shell": shell,
    "uuid": "forge@jmmaranan.com",
    "lineage": lineage,
    "installed_metadata": {
        "version": installed.get("version"),
        "version-name": installed.get("version-name"),
        "url": installed.get("url"),
        "shell-version": installed.get("shell-version"),
    },
    "paths": {
        "extension": str(Path.home() / ".local/share/gnome-shell/extensions/forge@jmmaranan.com"),
        "config": str(Path.home() / ".config/forge"),
        "dconf": "/org/gnome/shell/extensions/forge/",
    },
}
meta_path.write_text(json.dumps(data, indent=2) + "\n")
print(meta_path)
PY
}

# Keys present only on EGO (or old upstream) that jcrussell dropped or renamed.
# Values: note for translate report; empty means drop with no remap.
typeset -gA FORGE_KEY_TRANSLATE_NOTES=(
  [focus-border-size]="EGO gsetting removed; use Appearance prefs / CSS in jcrussell"
  [focus-border-color]="EGO gsetting removed; use Appearance prefs / CSS in jcrussell"
  [split-border-color]="EGO gsetting removed; use Appearance prefs / CSS in jcrussell"
  [primary-layout-mode]="EGO key; jcrussell uses tiling-mode-enabled + default-window-layout"
)

forge_schema_keys_from_xml() {
  # print key names from a gschema xml (both main + keybindings if in file)
  local xml="$1"
  [[ -f "$xml" ]] || return 1
  grep -oE 'name="[^"]+"' "$xml" | sed 's/name="//;s/"$//' | sort -u
}

forge_target_schema_keys() {
  # $1 optional: ego|jcrussell|path-to-xml|installed
  local target="${1:-installed}"
  local xml=""
  case "$target" in
    installed)
      xml="$FORGE_EXT_DIR/schemas/org.gnome.shell.extensions.forge.gschema.xml"
      ;;
    jcrussell|dev|repo)
      xml="$FORGE_REPO_ROOT/schemas/org.gnome.shell.extensions.forge.gschema.xml"
      ;;
    ego)
      # Prefer live EGO install if still present; else use forge_original if available
      if [[ -f "$FORGE_EXT_DIR/schemas/org.gnome.shell.extensions.forge.gschema.xml" ]] \
        && [[ "$(forge_detect_lineage)" == "ego" ]]; then
        xml="$FORGE_EXT_DIR/schemas/org.gnome.shell.extensions.forge.gschema.xml"
      elif [[ -f "$HOME/dev/me/forge_original/schemas/org.gnome.shell.extensions.forge.gschema.xml" ]]; then
        xml="$HOME/dev/me/forge_original/schemas/org.gnome.shell.extensions.forge.gschema.xml"
      else
        forge_die "no EGO schema available (install EGO forge or clone forge_original)"
      fi
      ;;
    *)
      if [[ -f "$target" ]]; then
        xml="$target"
      else
        forge_die "unknown schema target: $target"
      fi
      ;;
  esac
  [[ -f "$xml" ]] || forge_die "schema xml not found: $xml"
  forge_schema_keys_from_xml "$xml"
}

forge_parse_common_args() {
  # Consume shared flags; leave command-specific opts/args in FORGE_ARGS.
  # Unknown --flags are NOT rejected here (each script validates its own).
  FORGE_ARGS=()
  FORGE_WANT_HELP=0
  while (( $# )); do
    case "$1" in
      -h|--help) FORGE_WANT_HELP=1; shift ;;
      -V|--version) print -r -- "forge-manage $FORGE_VERSION"; exit 0 ;;
      --force) FORGE_FORCE=1; shift ;;
      --color=*) FORGE_COLOR="${1#--color=}"; shift ;;
      --color)
        [[ -n "${2:-}" ]] || forge_die "--color needs a value"
        FORGE_COLOR="$2"; shift 2
        ;;
      --backup-root=*) FORGE_BACKUP_ROOT="${1#--backup-root=}"; shift ;;
      --backup-root)
        [[ -n "${2:-}" ]] || forge_die "--backup-root needs a value"
        FORGE_BACKUP_ROOT="$2"; shift 2
        ;;
      --repo=*) FORGE_REPO_ROOT="${1#--repo=}"; shift ;;
      --repo)
        [[ -n "${2:-}" ]] || forge_die "--repo needs a value"
        FORGE_REPO_ROOT="$2"; shift 2
        ;;
      --) shift; FORGE_ARGS+=("$@"); break ;;
      *)
        FORGE_ARGS+=("$1"); shift ;;
    esac
  done
}

forge_print_deps_help() {
  cat <<'EOF'
Dependencies:
  hard: zsh, python3, dconf, gnome-extensions, gnome-shell
  install-ego: curl, unzip (or gnome-extensions install)
  install / install-jcrussell / update-jcrussell: make, node (>=20), npm, gettext (msgfmt), glib-compile-schemas
  check-updates: git, curl (for EGO)
EOF
}

# --- Install origin (git tree awareness for forge install / reinstall) ---

forge_write_install_origin() {
  # Record where the live extension was installed from so `forge install`
  # can re-run scripts/install.zsh after the CLI is on PATH.
  # Optional $1 = repo root (default FORGE_REPO_ROOT).
  local repo="${1:-$FORGE_REPO_ROOT}"
  local source="${2:-git}"
  [[ -n "$repo" ]] || forge_die "forge_write_install_origin: empty repo"
  repo="${repo:A}"
  mkdir -p "$FORGE_MANAGE_DIR"
  FORGE_CLI_BIN="$FORGE_CLI_BIN" python3 - "$repo" "$FORGE_ORIGIN_PATH" "$FORGE_EXT_DIR" "$source" "$FORGE_UUID" <<'PY'
import json, os, subprocess, sys, time
from pathlib import Path

repo = Path(sys.argv[1]).resolve()
origin_path = Path(sys.argv[2])
ext_dir = Path(sys.argv[3])
source = sys.argv[4]
uuid = sys.argv[5]

version_name = None
meta = ext_dir / "metadata.json"
if meta.is_file():
    try:
        version_name = json.loads(meta.read_text()).get("version-name")
    except Exception:
        pass

git_describe = None
git_remote = None
if (repo / ".git").exists() or (repo / ".git").is_file():
    try:
        git_describe = subprocess.check_output(
            ["git", "-C", str(repo), "describe", "--tags", "--always", "--dirty"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        pass
    try:
        git_remote = subprocess.check_output(
            ["git", "-C", str(repo), "remote", "get-url", "origin"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        pass

install_script = "scripts/install.zsh"
if not (repo / install_script).is_file():
    # Older trees may only have the forge/ helpers.
    if (repo / "scripts/forge/update-jcrussell.zsh").is_file():
        install_script = "scripts/forge/update-jcrussell.zsh"

cli_bin = os.environ.get("FORGE_CLI_BIN") or str(Path.home() / ".local/bin" / "forge")
data = {
    "source": source,  # git | ego (ego reserved for future)
    "repo": str(repo),
    "install_script": install_script,
    "cli": "scripts/forge/forge",
    "cli_bin": cli_bin,
    "uuid": uuid,
    "version-name": version_name,
    "git_describe": git_describe,
    "git_remote": git_remote,
    "installed_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    "host": os.uname().nodename if hasattr(os, "uname") else "",
}
origin_path.write_text(json.dumps(data, indent=2) + "\n")
# Copy into extension tree when present (wiped on next replace; manage path is durable).
if ext_dir.is_dir():
    try:
        (ext_dir / "install-origin.json").write_text(json.dumps(data, indent=2) + "\n")
    except OSError:
        pass
print(origin_path)
PY
  forge_ok "install origin → $FORGE_ORIGIN_PATH (source=$source repo=$repo)"
  # Place `forge` on PATH for daily use (symlink into ~/.local/bin).
  forge_install_cli_bin || forge_warn "CLI bin not installed (non-fatal)"
}

# --- User CLI (~/.local/bin/forge) ---

forge_cli_repo_path() {
  # Absolute path to scripts/forge/forge under FORGE_REPO_ROOT.
  print -r -- "${FORGE_REPO_ROOT:A}/scripts/forge/forge"
}

forge_cli_bin_is_ours() {
  # True if $FORGE_CLI_BIN is a symlink (or wrapper) we installed.
  local target="${1:-$FORGE_CLI_BIN}"
  [[ -e "$target" || -L "$target" ]] || return 1

  if [[ -L "$target" ]]; then
    local link dest
    link=$(readlink "$target" 2>/dev/null) || return 1
    # Absolute or relative; dangling OK if path shape matches.
    if [[ "$link" == /* ]]; then
      dest="$link"
    else
      dest="${target:A:h}/$link"
    fi
    # Ours: …/scripts/forge/forge (even if clone moved later and link is stale).
    [[ "$dest" == */scripts/forge/forge ]] && return 0
    [[ "$link" == */scripts/forge/forge ]] && return 0
    local expect
    expect=$(forge_cli_repo_path)
    [[ "$dest" == "$expect" || "$link" == "$expect" ]] && return 0
    return 1
  fi

  # Thin wrapper we might install later (marker in file body).
  if [[ -f "$target" ]] && grep -qE 'FORGE_CLI_WRAPPER=1|# forge-cli-wrapper' "$target" 2>/dev/null; then
    return 0
  fi
  return 1
}

forge_install_cli_bin() {
  # Symlink $FORGE_CLI_BIN → repo scripts/forge/forge. Refuses foreign files.
  local src="${1:-}"
  if [[ -z "$src" ]]; then
    src=$(forge_cli_repo_path)
  fi
  src="${src:A}"
  if [[ ! -f "$src" ]]; then
    forge_warn "CLI source missing: $src"
    return 1
  fi
  chmod +x "$src" 2>/dev/null || true

  mkdir -p "$FORGE_CLI_BIN_DIR"
  if [[ -e "$FORGE_CLI_BIN" || -L "$FORGE_CLI_BIN" ]]; then
    if forge_cli_bin_is_ours; then
      ln -sfn "$src" "$FORGE_CLI_BIN"
    else
      forge_warn "refusing to overwrite non-forge ${c_cyan}$FORGE_CLI_BIN${c_reset}"
      forge_info "Remove it (or set FORGE_CLI_BIN) and re-run install"
      return 1
    fi
  else
    ln -sfn "$src" "$FORGE_CLI_BIN"
  fi
  forge_ok "CLI → ${c_cyan}$FORGE_CLI_BIN${c_reset} → ${c_cyan}$src${c_reset}"

  # PATH / shadow hints (non-fatal).
  if [[ ":$PATH:" != *":$FORGE_CLI_BIN_DIR:"* ]]; then
    forge_warn "${c_blue}$FORGE_CLI_BIN_DIR${c_reset} is not on PATH"
    forge_info "Add to shell rc: ${c_blue}export PATH=\"$FORGE_CLI_BIN_DIR:\$PATH\"${c_reset}"
  elif command -v forge >/dev/null 2>&1; then
    local resolved
    resolved=$(command -v forge)
    if [[ "$resolved" != "$FORGE_CLI_BIN" ]]; then
      forge_warn "\`forge\` resolves to ${c_cyan}$resolved${c_reset}, not $FORGE_CLI_BIN"
    else
      forge_info "\`forge\` on PATH (${c_cyan}$FORGE_CLI_BIN${c_reset})"
    fi
  fi
  return 0
}

forge_uninstall_cli_bin() {
  # Remove $FORGE_CLI_BIN only when we own it.
  if [[ ! -e "$FORGE_CLI_BIN" && ! -L "$FORGE_CLI_BIN" ]]; then
    forge_info "no CLI at $FORGE_CLI_BIN"
    return 0
  fi
  if forge_cli_bin_is_ours; then
    rm -f "$FORGE_CLI_BIN"
    forge_ok "removed ${c_cyan}$FORGE_CLI_BIN${c_reset}"
  else
    forge_warn "left ${c_cyan}$FORGE_CLI_BIN${c_reset} (not owned by forge install)"
  fi
  return 0
}

forge_read_install_origin() {
  # Print install-origin.json path if readable; else return 1.
  local p="$FORGE_ORIGIN_PATH"
  if [[ -f "$p" ]]; then
    print -r -- "$p"
    return 0
  fi
  if [[ -f "$FORGE_EXT_DIR/install-origin.json" ]]; then
    print -r -- "$FORGE_EXT_DIR/install-origin.json"
    return 0
  fi
  return 1
}

forge_origin_field() {
  # $1 field name from install-origin.json
  # Never name a local `path` — zsh ties path[] ↔ PATH.
  local field="$1" origin_file
  origin_file=$(forge_read_install_origin) || return 1
  python3 -c '
import json, sys
from pathlib import Path
d = json.loads(Path(sys.argv[1]).read_text())
v = d.get(sys.argv[2])
print("" if v is None else v)
' "$origin_file" "$field"
}

# --- Theme / CSS (jcrussell stores colors in stylesheet, not gsettings) ---

forge_css_tag() {
  # ThemeManagerBase.cssTag in installed extension, else this repo
  local f
  for f in \
    "$FORGE_EXT_DIR/lib/shared/theme.js" \
    "$FORGE_REPO_ROOT/lib/shared/theme.js" \
    "$FORGE_REPO_ROOT/temp/lib/shared/theme.js"
  do
    if [[ -f "$f" ]]; then
      local tag
      tag=$(grep -oE 'cssTag = [0-9]+' "$f" 2>/dev/null | head -1 | grep -oE '[0-9]+' || true)
      if [[ -n "$tag" ]]; then
        print -r -- "$tag"
        return 0
      fi
    fi
  done
  print -r -- "38" # known jcrussell tag as of v49-90-beta.2
}

forge_stamp_css_last_update() {
  # Set css-last-update == ThemeManager cssTag so enable()/patchCss will NOT
  # overwrite ~/.config/forge/stylesheet/forge/stylesheet.css with defaults.
  forge_need_cmd gsettings
  local tag sd
  tag=$(forge_css_tag)
  sd=$(forge_schema_dir) || forge_die "no schemas dir for stamping css-last-update"
  GSETTINGS_SCHEMA_DIR="$sd" gsettings set "$FORGE_SCHEMA_MAIN" css-last-update "$tag"
  forge_ok "css-last-update → $tag (prevents patchCss clobber)"
}

forge_trigger_css_reload() {
  # Bump css-updated so a live extension reloads the user stylesheet (no reboot).
  forge_need_cmd gsettings
  local sd now
  sd=$(forge_schema_dir) || forge_die "no schemas dir for css reload"
  now=$(date +%s%3N 2>/dev/null || date +%s)
  GSETTINGS_SCHEMA_DIR="$sd" gsettings set "$FORGE_SCHEMA_MAIN" css-updated "$now"
  forge_ok "css-updated → $now (extension reloads stylesheet if enabled)"
}

forge_user_stylesheet_path() {
  print -r -- "$FORGE_CONFIG_DIR/stylesheet/forge/stylesheet.css"
}

# Pick best stylesheet source from a backup dir (stdout = path or empty).
forge_backup_stylesheet_candidate() {
  local bak="$1"
  local c
  for c in \
    "$bak/config/stylesheet/forge/stylesheet.css" \
    "$bak/stylesheet/forge/stylesheet.css" \
    "$bak/stylesheet-custom-pre-jcrussell.css" \
    "$bak/config/stylesheet/forge/stylesheet.css.bak"
  do
    if [[ -f "$c" && -s "$c" ]]; then
      print -r -- "$c"
      return 0
    fi
  done
  return 1
}

# Extract EGO-era border colors from a dconf dump or gsettings text file.
# Prints: focus_color|focus_size|split_color  (empty fields if missing)
forge_extract_ego_colors() {
  local src="$1"
  [[ -f "$src" ]] || return 1
  python3 - "$src" <<'PY'
import re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text()
def grab(key):
    # dconf: key=value  or gsettings list-recursively: schema key value
    m = re.search(rf"(?:^|\s){re.escape(key)}\s+(?:uint32\s+)?(.+)$", text, re.M)
    if m:
        return m.group(1).strip().strip("'\"")
    m = re.search(rf"^{re.escape(key)}=(.+)$", text, re.M)
    if m:
        return m.group(1).strip().strip("'\"")
    return ""
focus = grab("focus-border-color")
size = grab("focus-border-size")
if size.startswith("uint32"):
    size = size.split()[-1]
split = grab("split-border-color")
print(f"{focus}|{size}|{split}")
PY
}

# Apply EGO gsettings colors into a stylesheet file (in-place or to out path).
# Only touches tiled/focus + split palette rules.
forge_apply_ego_colors_to_css() {
  local css_in="$1" css_out="$2" focus_color="$3" focus_size="$4" split_color="$5"
  python3 - "$css_in" "$css_out" "$focus_color" "$focus_size" "$split_color" <<'PY'
import re, sys
from pathlib import Path
src, dst, focus, size, split = sys.argv[1:6]
text = Path(src).read_text()

def set_rule_props(css, selector, props):
    # props: dict property -> value (already formatted)
    pat = re.compile(
        rf"({re.escape(selector)}\s*\{{)(.*?)(\n\}})",
        re.S,
    )
    m = pat.search(css)
    if not m:
        return css
    body = m.group(2)
    for prop, val in props.items():
        if not val:
            continue
        if re.search(rf"{re.escape(prop)}\s*:", body):
            body = re.sub(rf"({re.escape(prop)}\s*:\s*)[^;]+;", rf"\g<1>{val};", body, count=1)
        else:
            body = body.rstrip() + f"\n  {prop}: {val};\n"
    return css[: m.start()] + m.group(1) + body + m.group(3) + css[m.end() :]

if focus:
    text = set_rule_props(text, ".tiled", {"color": focus, "border-width": f"{size}px" if size else ""})
    text = set_rule_props(
        text,
        ".window-tiled-border",
        {"border-color": focus, "border-width": f"{size}px" if size else ""},
    )
if split:
    text = set_rule_props(text, ".split", {"color": split})
    text = set_rule_props(text, ".window-split-border", {"border-color": split})

Path(dst).parent.mkdir(parents=True, exist_ok=True)
Path(dst).write_text(text)
print(dst)
PY
}

# Restore theme colors from a backup after install/enable.
# Order: restore user stylesheet → optional EGO color patch → stamp css-last-update.
forge_restore_theme_from_backup() {
  local bak="$1"
  local dest dest_dir css_src ego_src focus size split tag

  dest=$(forge_user_stylesheet_path)
  dest_dir="${dest:h}"
  mkdir -p "$dest_dir"

  css_src=""
  if css_src=$(forge_backup_stylesheet_candidate "$bak"); then
    forge_info "stylesheet from backup: $css_src"
    # Keep a safety copy of whatever is live now
    if [[ -f "$dest" ]]; then
      cp -a "$dest" "${dest}.pre-restore-$(forge_stamp)" 2>/dev/null || true
    fi
    cp -a "$css_src" "$dest"
    forge_ok "restored stylesheet → $dest"
  else
    forge_warn "no stylesheet in backup; will try EGO gsettings colors only"
    # Seed from extension default if missing
    if [[ ! -f "$dest" && -f "$FORGE_EXT_DIR/stylesheet.css" ]]; then
      cp -a "$FORGE_EXT_DIR/stylesheet.css" "$dest"
    fi
  fi

  # If backup still has EGO color keys (in dconf dump or gsettings txt), merge them
  # into CSS when the restored file still has stock red focus (common first-run).
  ego_src=""
  [[ -f "$bak/gsettings-forge.txt" ]] && ego_src="$bak/gsettings-forge.txt"
  [[ -z "$ego_src" && -f "$bak/dconf-forge.conf" ]] && ego_src="$bak/dconf-forge.conf"
  if [[ -n "$ego_src" && -f "$dest" ]]; then
    IFS='|' read -r focus size split <<<"$(forge_extract_ego_colors "$ego_src" || true)"
    if [[ -n "$focus" || -n "$split" ]]; then
      # Only merge EGO gsettings colors when the *border* still looks stock.
      # Do not grep the whole file: many themes leave `.tiled { color: red }`
      # palette stubs while customizing `.window-tiled-border` only.
      border_color=$(python3 - "$dest" <<'PY'
import re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text()
m = re.search(r"\.window-tiled-border\s*\{([^}]*)\}", text, re.S)
if not m:
    print("")
    raise SystemExit
body = m.group(1)
cm = re.search(r"border-color\s*:\s*([^;]+);", body)
print(cm.group(1).strip() if cm else "")
PY
)
      # Stock jcrussell / EGO default focus border
      if [[ "$border_color" == *"236, 94, 94"* || "$border_color" == *"236,94,94"* ]]; then
        forge_info "merging EGO gsettings colors (stock focus border: $border_color)"
        forge_apply_ego_colors_to_css "$dest" "$dest" "$focus" "$size" "$split" >/dev/null
        forge_ok "EGO colors applied (focus=${focus:-none} size=${size:-?} split=${split:-none})"
      else
        forge_info "custom focus border already set ($border_color) — skip EGO gsettings color merge"
      fi
    fi
  fi

  [[ -f "$dest" ]] || forge_warn "no stylesheet at $dest after restore"
  forge_stamp_css_last_update
  forge_trigger_css_reload
}
