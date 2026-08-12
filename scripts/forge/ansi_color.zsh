# ansi_color.zsh — portable color enablement (shellrc contract).
# Source only. Keep ANSI_COLOR_VERSION in sync with util/py/ansi_color.py etc.
#
# Decision order: agents-catalog ansi-colors.md

# Contract implementation version (must match py/js/lua + vendored copies).
ANSI_COLOR_VERSION=1.0.0

# ansi_color_truthy_force RAW → 0 if force-like true
ansi_color_truthy_force() {
  local s=${1:-}
  s=${s:l}
  [[ -z $s || $s == 0 || $s == false || $s == no || $s == off ]] && return 1
  return 0
}

# ansi_color_resolve_mode [cli_mode] → prints always|never|auto
# Uses current environment. cli_mode empty = not passed.
ansi_color_resolve_mode() {
  local cli=${1:-}
  local m=auto
  if [[ -n $cli ]]; then
    m=${cli:l}
    case $m in
      always|never) print -r -- $m; return 0 ;;
      auto) ;;
      *) print -r -- auto ;;
    esac
  fi

  if [[ -n ${NO_COLOR:-} ]]; then
    print -r -- never
    return 0
  fi

  if ansi_color_truthy_force "${FORCE_COLOR:-}" || ansi_color_truthy_force "${CLICOLOR_FORCE:-}"; then
    print -r -- always
    return 0
  fi

  local em
  for em in "${FORGE_COLOR:-}" "${COLOR:-}"; do
    case ${em:l} in
      always|never) print -r -- ${em:l}; return 0 ;;
      auto) m=auto ;;
    esac
  done

  print -r -- $m
}

# ansi_color_enabled fd [cli_mode] → status 0 if color on
# fd: 1=stdout 2=stderr (default 1)
ansi_color_enabled() {
  local fd=${1:-1}
  local cli=${2:-}
  local mode
  mode=$(ansi_color_resolve_mode "$cli")
  case $mode in
    always) return 0 ;;
    never) return 1 ;;
  esac
  [[ -t $fd ]]
}
