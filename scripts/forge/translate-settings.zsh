#!/usr/bin/env zsh
# Filter a dconf dump so only keys valid for a target schema remain.
# Usage: translate-settings.zsh [--to=jcrussell|ego|installed|XML] [in.conf [out.conf]]
emulate -L zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
source "$SCRIPT_DIR/_lib.zsh"

usage() {
  cat <<EOF
${c_bold}translate-settings.zsh${c_reset} — map Forge dconf dump across schema versions

Usage:
  translate-settings.zsh [options] [input.conf [output.conf]]

Options:
  --to=TARGET     jcrussell|ego|installed|path/to.gschema.xml (default: jcrussell)
  --from=BACKUP   Read BACKUP/dconf-forge.conf (and write report next to it)
  --report=FILE   Write dropped/kept summary (default: stdout + .report next to out)
  --in-place      Overwrite input
  --color=auto|always|never
  -h, --help

Notes:
  • Same UUID is used by EGO and jcrussell; only the *schema keys* differ.
  • EGO-only keys (focus-border-color/size, split-border-color, primary-layout-mode)
    are dropped when targeting jcrussell (appearance moved to CSS / new prefs).
  • Unknown keys left in dconf are usually harmless; translate keeps dumps clean.
  • Keybindings under [keybindings] are filtered against the same schema file.

Examples:
  translate-settings.zsh --to=jcrussell backup/dconf-forge.conf backup/dconf-jcrussell.conf
  translate-settings.zsh --from=~/.local/share/forge-manage/backups/latest --to=jcrussell

$(forge_print_deps_help)
EOF
}

TO="jcrussell"
FROM=""
REPORT=""
IN_PLACE=0
forge_parse_common_args "$@"
if (( ${#FORGE_ARGS[@]} > 0 )); then
  set -- "${FORGE_ARGS[@]}"
else
  set --
fi
[[ "${FORGE_WANT_HELP:-0}" == "1" ]] && { usage; exit 0; }

while (( $# )); do
  case "$1" in
    --to=*) TO="${1#--to=}"; shift ;;
    --to) TO="${2:?}"; shift 2 ;;
    --from=*) FROM="${1#--from=}"; shift ;;
    --from) FROM="${2:?}"; shift 2 ;;
    --report=*) REPORT="${1#--report=}"; shift ;;
    --report) REPORT="${2:?}"; shift 2 ;;
    --in-place) IN_PLACE=1; shift ;;
    -*) forge_die "unknown option: $1" ;;
    *) break ;;
  esac
done

forge_need_cmd python3

IN=""
OUT=""
if [[ -n "$FROM" ]]; then
  [[ -d "$FROM" ]] || forge_die "backup dir not found: $FROM"
  IN="$FROM/dconf-forge.conf"
  OUT="${1:-$FROM/dconf-translated.conf}"
else
  IN="${1:-}"
  OUT="${2:-}"
fi

if [[ -z "$IN" || "$IN" == "-" ]]; then
  IN_TMP=$(mktemp)
  cat >"$IN_TMP"
  IN="$IN_TMP"
  TRAP_CLEAN=1
fi
[[ -f "$IN" ]] || forge_die "input not found: $IN"

if (( IN_PLACE )); then
  OUT="$IN"
elif [[ -z "${OUT:-}" ]]; then
  OUT="${IN:r}-translated.conf"
fi

keys_file=$(mktemp)
forge_target_schema_keys "$TO" >"$keys_file"

report_file="${REPORT:-${OUT}.report}"

python3 - "$IN" "$OUT" "$keys_file" "$report_file" "$TO" <<'PY'
import sys
from pathlib import Path

inp, outp, keys_path, report_path, target = sys.argv[1:6]
allowed = set(Path(keys_path).read_text().split())

# Known EGO→jcrussell notes (mirrors shell map for the report)
notes = {
    "focus-border-size": "removed; use Appearance / CSS in jcrussell",
    "focus-border-color": "removed; use Appearance / CSS in jcrussell",
    "split-border-color": "removed; use Appearance / CSS in jcrussell",
    "primary-layout-mode": "removed; use tiling-mode-enabled + default-window-layout",
}

text = Path(inp).read_text()
lines = text.splitlines(keepends=True)

kept = []
dropped = []
section = None  # None | '' (root) | 'keybindings'
out_lines = []
# track whether current section has any kept keys
section_buf = []
section_name = None
section_has = False

def flush_section():
    global section_buf, section_name, section_has, out_lines
    if section_name is None and not section_buf:
        return
    if section_has or section_name is None:
        if section_name is not None:
            out_lines.append(f"[{section_name}]\n" if section_name else "[/]\n")
        out_lines.extend(section_buf)
        if section_buf and not out_lines[-1].endswith("\n"):
            pass
    section_buf = []
    section_has = False

for line in lines:
    raw = line
    s = line.strip()
    if not s or s.startswith("#"):
        if section_name is not None:
            section_buf.append(raw)
        else:
            out_lines.append(raw)
        continue
    if s.startswith("[") and s.endswith("]"):
        flush_section()
        name = s[1:-1]
        section_name = name
        section_buf = []
        section_has = False
        continue
    if "=" not in s:
        section_buf.append(raw)
        continue
    key = s.split("=", 1)[0].strip()
    if key in allowed:
        section_buf.append(raw)
        section_has = True
        kept.append(key)
    else:
        dropped.append((key, notes.get(key, "not in target schema")))

flush_section()

Path(outp).write_text("".join(out_lines))

report = []
report.append(f"target={target}")
report.append(f"kept={len(kept)}")
report.append(f"dropped={len(dropped)}")
report.append("")
if dropped:
    report.append("Dropped keys:")
    for k, why in sorted(dropped):
        report.append(f"  - {k}: {why}")
report.append("")
report.append("Kept keys:")
for k in sorted(set(kept)):
    report.append(f"  - {k}")
Path(report_path).write_text("\n".join(report) + "\n")
# Report → stderr only so callers can capture the out path cleanly on stdout.
print("\n".join(report), file=sys.stderr)
PY

rm -f "$keys_file"
[[ -n "${TRAP_CLEAN:-}" ]] && rm -f "${IN_TMP:-}"

forge_ok "wrote $OUT"
forge_info "report $report_file"
# Sole stdout line: absolute path to translated dump (for apply capture).
print -r -- "${OUT:A}"
