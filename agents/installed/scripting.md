---
title: Scripting
read_when: Writing or changing shell/Python scripts, installers, CLI tools, or bin entries
order: 40
---

# Scripting

Assume **Linux** (Ubuntu LTS unless stated). Prefer portable choices when cheap.

Language style: `agents/languages/<lang>.md` when relevant. In-repo formatter/LSP wins.

## Scripts → `bin/`

`installer/build-scripts.py` flattens tools into `$shellrc/bin/`.

| Kind | How |
| --- | --- |
| Standalone | `scripts/foo.zsh` → `bin/foo` |
| Multi-file | Package markers; only entry lands in `bin/` |

Do not treat a shebang alone as “this is a bin entry.” See `agents/scripts-build.md` when present.

## All scripts

- Hashbang always (including sourced files)
- Support `--help` and `--version`; list dependencies
- Check deps before run; on TTY offer preferred installer when known
- Fail gracefully; solid errors/exit codes
- Colors: `ansi-colors.md`; comments: `comments.md`
- Prefer single-file ~500–1000 lines; larger → multi-file project
- Almost never emoji in code (except test ✓/X)

## Missing dependencies (FIRM)

Before first use of a required tool: `command -v` / `shutil.which`. Message names the tool + preferred install. Exit **127** for missing binary.

Install path preference: (1) shellrc `install-<tool>` / `user-install-<tool>`, (2) distro package, (3) upstream. Do not invent names.

| Mode | Behavior |
| --- | --- |
| Interactive TTY | Ask to install (default yes for user-scoped; no for sudo/system) |
| Non-interactive / CI | Never auto-install; print command; exit 127 |

## Interactive vs script mode

Detect TTY on stdin+stdout.

| Mode | Destructive ops |
| --- | --- |
| Interactive | Confirm (prefer exact `yes` for high risk) |
| Script/CI | **Refuse** unless `--force` (or equally explicit flag) |

Never assume “yes” non-interactively for delete/overwrite/wipe/foreign-host apply.

## Args

- Python: `argparse`
- zsh: prefer `--key=value`; `zparseopts` when needed
- Destructive ops pair with `--force` for non-interactive

## Shell

`set -euo pipefail` · `local` · quote vars · `[[ ]]` · `trap` cleanup · `emulate -L zsh` when sourced · `exec` final command in env wrappers.

## Language choice

| Prefer | When |
| --- | --- |
| zsh | Wrappers, small installers |
| bash/POSIX | Must run where only sh exists |
| Python 3 | Complex logic/data |
| Lua | Minimal footprint when appropriate |
| JS | When project is already JS |
