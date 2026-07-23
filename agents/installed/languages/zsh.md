# zsh

**Precedence:** in-repo `.editorconfig`, `shfmt` flags, shellcheck config, and project scripts override this file.

## When

Default for shellrc scripts and modules. Prefer over bash unless the script must run without zsh.

## Style

- Hashbang: `#!/usr/bin/env zsh`
- Indent 2 spaces (`shfmt -i 2`); Unix newlines
- `set -euo pipefail` in executable scripts
- Sourced modules: `emulate -L zsh` at top of script or of the main function
- `local` for function vars; quote expansions
- Prefer `[[ ]]`, `(( ))`, zsh arrays/parameter expansion over external forks
- Args: prefer `--key=value`; `zparseopts` for multi-option tools
- Support `--help` / `--version`; list deps; detect missing deps
- Colors: `agents/ansi-colors.md`; prefer `util/zsh/p.zsh` when available

## shellrc modules

- Source with an argument (even `""`) so `$@`/`$0` stay scoped for consumers
- Avoid process forks on the interactive/startup hot path when builtins suffice
- Comments: `agents/comments.md`

## Tools

- Format: `shfmt`
- Lint: `shellcheck` when practical (zsh dialect caveats apply)
