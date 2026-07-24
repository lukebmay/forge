#!/usr/bin/env zsh
# Force a live Forge stylesheet reload (no reboot / shell restart).
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}reload-theme.zsh${c_reset} — reload Forge user stylesheet in a running Shell

Bumps gsettings css-updated so ExtensionThemeManager reloads
~/.config/forge/stylesheet/forge/stylesheet.css without reboot.

Also works after Super+Shift+r (ConfigReload re-imports CSS).

Usage:
  reload-theme.zsh [options]

Options:
  --force
  --color=auto|always|never
  -h, --help

$(forge_print_deps_help)
EOF
}

forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }
(( $# == 0 )) || forge_die "unexpected args: $*"

forge_hdr "Reload Forge stylesheet"
css=$(forge_user_stylesheet_path)
if [[ -f "$css" ]]; then
  forge_info "user stylesheet: $css"
  # Show focus border so the user can confirm colors are the expected ones
  border=$(python3 - "$css" <<'PY' 2>/dev/null || true
import re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text()
m = re.search(r"\.window-tiled-border\s*\{([^}]*)\}", text, re.S)
if not m:
    print("(no .window-tiled-border)")
    raise SystemExit
cm = re.search(r"border-color\s*:\s*([^;]+);", m.group(1))
print(cm.group(1).strip() if cm else "(no border-color)")
PY
)
  forge_info "focus border-color: $border"
else
  forge_warn "no user stylesheet at $css (bundled default will load)"
fi

forge_stamp_css_last_update
forge_trigger_css_reload
forge_ok "if colors still wrong: make dev (or make prod), then re-run this; X11: Alt+F2 → r"
