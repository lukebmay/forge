# Scripting

Assume **Linux** (latest Ubuntu LTS unless stated). Prefer portable choices when cheap.

Language-specific style: `agents/languages/<lang>.md`. **In-repo** formatter/LSP/style configs override those files.

## Scripts → `bin/` (install)

`installer/build-scripts.py` flattens tools into `$shellrc/bin/` on PATH.

| Kind | How it installs |
| --- | --- |
| **Standalone** | One file under `scripts/` → `bin/<stem>` (extension stripped) |
| **Multi-file project** | Language-specific **package/project markers**; only the entry lands in `bin/` |

**Do not** treat shebang as “this file is a bin entry.” Libraries often use shebangs and `if __name__ == "__main__":` for smoke tests.

Full rules, Python package layout, and planned multi-language markers: **`agents/scripts-build.md`**.

## All scripts

- Hashbang always (including sourced files).
- Support `--help` and `--version`; list dependencies in help.
- Check deps before run; on TTY **ask to auto-install** when a known installer exists (see below).
- Fail gracefully; solid error handling, logging, exit codes.
- ANSI colors: `agents/ansi-colors.md`.
- Comments: `agents/comments.md`.
- Prefer single-file scripts under ~500–1000 lines; larger work → multi-file project (`agents/scripts-build.md`).
- Readability first; optimize only when cost approaches seconds.
- Short names only for obvious locals (`i`, `k`/`v`, `f`) or conventional math (comment the terms).
- Almost never emoji/unicode in code. Exceptions: test/task results — green `✓` / red `X`.

## Dependency checks (required)

Scripts and non-trivial functions **must fail early and clearly** when a required tool is missing. Never continue with a half-broken PATH or a cryptic downstream error.

| Rule | Detail |
| --- | --- |
| **When** | Before first use of an external binary, package, or service the tool cannot run without |
| **How** | `command -v tool` (shell) / `shutil.which` (Python) / equivalent — check each hard dependency |
| **Message** | Name the missing tool; say what the script was trying to do; prefer **install path** (below) over a bare “not found” |
| **Exit code** | **127** when the failure is “command not found” / missing binary; **1** (or domain code) for other precondition failures; never exit 0 on a hard missing dep |
| **Optional deps** | Soft features may degrade (warn once, continue) — document in `--help` as optional; still offer install on TTY when the user is about to use that feature |
| **Help text** | List hard + optional dependencies in `--help` / `--version` area so humans see them without failing first |

### Resolve install path (prefer shellrc installers)

When telling the user (or auto-running) how to get a missing tool, pick the **first** match:

1. **shellrc custom installer** — if `bin/install-<tool>`, `bin/user-install-<tool>`, or a documented sibling exists on PATH (or under `$shellrc/bin/`), use that. Prefer the **user-default** entry (`install-<tool>` after merges; else `user-install-<tool>`) so no sudo is required when possible. Mention `--system` only when the user needs a system install.
2. **Distro package** — Ubuntu/Debian default: `sudo apt install <pkg>` (real package name only).
3. **Upstream** — official install URL or documented one-liner; **do not invent** package or binary names.

Examples of shellrc-first tools: `install-yazi`, `install-fzf`, `install-rg`, `install-nvim`, `install-delta`, …

### Auto-install on missing deps (ask first)

| Mode | Behavior |
| --- | --- |
| **Interactive TTY** | Print what is missing and the **preferred** install command. **Ask** to run it now (default **yes** when the installer is non-destructive / user-scoped; default **no** if it needs sudo/root or is clearly system-wide). On yes: run installer, re-check `command -v`, continue if the dep is present. On no / failure: print the command again and exit **127** for hard deps. |
| **Non-interactive / CI / pipe** | **Never** auto-install. Print the preferred install command and exit **127** (hard) or degrade (optional). |
| **`--force` / install flags** | Do not combine silent auto-install of unrelated tools with destructive ops; keep missing-dep install a separate, explicit prompt or refuse. |

Pseudo-flow (hard dep):

```text
missing `fzf` (needed for interactive path pick)
Preferred: install-fzf
# or: sudo apt install fzf   (only if no shellrc installer)

Install now? [Y/n]
```

After a successful auto-install, re-resolve PATH if the installer wrote under `~/.local/bin` (ensure that dir is on PATH for the rest of the run when practical).

### Install message shape

```text
error: `fzf` not found (needed for interactive path pick)
Install: install-fzf
# fallback: sudo apt install fzf
```

### Consistency

| Kind | Convention |
| --- | --- |
| Prefix | `scriptname: ` on stderr for errors (match existing tools) |
| Colors | Red/error for fatal; yellow for warn; see `ansi-colors.md` |
| Interactive | Ask to auto-install via preferred shellrc installer when available |
| Non-interactive | No install prompts; always print the install command |
| Source modules | Optional tools: guard and `return 0` quietly (or debug note); installers remain the place for hard errors |

## Interactive vs script mode (non-trivial tools)

Detect whether a human is driving the command (typical: both stdin and stdout are TTYs). Behavior should fork:

| Mode | Detect | Safe defaults | Destructive / irreversible |
| --- | --- | --- | --- |
| **Interactive** | e.g. `stdin` + `stdout` are TTYs | Prompt for confirmations, optional edits, descriptions | Ask explicitly (prefer exact answer `yes`, not bare `y`, for high risk) |
| **Script / CI / pipe** | not a TTY (or stdin closed) | Keep existing state; no prompts; no surprise writes | **Refuse** unless the user passes **`--force`** (or an equally explicit flag) |

Rules of thumb:

1. **Never** assume “yes” in non-interactive mode for delete, overwrite, wipe, host wipe, raw config edit, or foreign-host apply.
2. **`--force`** means “I know; do it anyway” — document it in `--help` next to every dangerous op.
3. Interactive prompts should print a short **what will happen** (paths, names) before asking.
4. Optional niceties (open `$EDITOR`, “modify description?”) are **TTY-only**; script mode skips them and keeps prior values unless flags set them.
5. Mismatched hardware / foreign machine apply: warn in color and require `--force` even on a TTY when risk is high (or always require it for foreign hosts — be consistent per tool).
6. Same pattern in zsh/Python: `[[ -t 0 && -t 1 ]]` / `sys.stdin.isatty() and sys.stdout.isatty()`.

Example (`gdisplays`; shellrc also aliases `displays=gdisplays`):

- `gdisplays delete name` → interactive `yes`; non-interactive needs `--force`
- `gdisplays delete-host oldpc` → same
- `gdisplays copy a b` when `b` exists → confirm / `--force`
- `gdisplays load` never uses `--force` (stale connectors unsafe); foreign host → TTY confirm or `copy` then load; renames auto-remap
- `gdisplays --user-to-login` (and other GDM ops) re-exec via `sudo` when needed; **default** sudo password prompt only — no multi-line “root/sudo/escalating” preamble
- `gdisplays save name` without `-d` → prompt only on TTY; scripts keep existing description

## CLI UX (human-facing output) — GUIDELINE

Agents writing or polishing CLI tools must treat **stdout as a product surface**, not a debug log. Prefer short, scannable progress over essays.

### Principles

| Rule | Detail |
| --- | --- |
| **Say each fact once** | Do not repeat “root”, “sudo”, “password”, or the same path in a banner, a body line, *and* a custom sudo prompt. |
| **Privilege escalation is quiet** | Re-exec via `sudo` is fine. On TTY use the **default** sudo prompt (`[sudo] password for user:`). Do **not** print “Root required”, “Escalating with sudo”, “password is from sudo not this tool”, and a custom `-p` that re-explains root — that is three messages for one action. |
| **Progress, not post-mortems** | Successful multi-step ops: one line per step, **present progressive** (“Backing up …”, “Updating …”), trailing green `✓` (see `ansi-colors.md` — ticks for **steps**, not overall success lines). |
| **Paths** | Color paths **cyan** (files/dirs). In yellow warnings, use **blue** for paths. Prefer showing a useful relative backup name after `→` when the directory is already clear. |
| **No filler** | Drop “desktop file unchanged”, full absolute backup destinations when basename + source path already tell the story, optional layout dumps the user did not ask for. |
| **Warnings stay short** | One line, actionable if needed. Prefer *what the tool did* over *why GNOME is sad* in three clauses. |
| **Space the closer** | Blank line before the final human instruction (e.g. “Log out or reboot…”) so it is not glued to progress ticks. |
| **Errors get the prose** | Failures may explain more. Happy paths stay terse. |

### Shape: multi-step privileged op (good)

```text
[sudo] password for luke:
Backing up /var/lib/gdm3/.config/monitors.xml → monitors.xml.bak.20260804-162435... ✓
Updating login display settings from user layout... ✓
GDM greeter cannot use fractional scaling, so using scale=1

Log out or reboot to see the login screen change.
```

### Shape: same op (bad — do not ship)

```text
Root required  --user-to-login
  Updates the GDM greeter layout under /var/lib/gdm3 (owned by gdm/root).
  Copies your user monitors.xml and flattens fractional scale so login accepts it.
  Escalating with sudo (password prompt is from sudo, not this tool).

[sudo] password for luke — gdisplays needs root for --user-to-login:
Backed up login monitors.xml
  /var/lib/gdm3/.config/monitors.xml
  → /var/lib/gdm3/.config/monitors.xml.bak.…
Login screen layout updated from user
  /home/luke/.config/monitors.xml
  → /var/lib/gdm3/.config/monitors.xml
GDM greeter cannot use fractional scale — wrote scale=1 for login only
  greeter: *DP-1 → HDMI-1  (desktop file unchanged)
Log out or reboot to see the login screen change.
```

### Checklist before shipping CLI output

1. Count mentions of the same theme (sudo/root, remap, backup) — keep **one**.
2. Read the happy path out loud: if it sounds like a tutorial, cut.
3. Colors match `ansi-colors.md` (cyan paths, blue commands, green step `✓`, yellow warn).
4. Script/pipe mode: no prompts; no chatty “optional: …” stacks unless an error.

## Args

- **Python:** `argparse` (`--key value` and `--key=value`).
- **zsh:** prefer `--key=value`; `zparseopts` unless unusual opts need hand parsing.
- Otherwise use the language’s standard/popular parser when option sets grow.
- Destructive ops: pair with `--force` for non-interactive use (see above).

## Shell

- `set -euo pipefail`
- `local` in functions; quote `"$var"` and `"$(cmd)"`
- Prefer `[[ ]]` over `[ ]`
- `trap` for cleanup on `EXIT`/`ERR`
- Defend against caller env: `emulate -L zsh` (script top or function top if sourced); set `-euo pipefail`; save/restore `IFS` if changed
- Wrappers that only set env then run another program: `exec` the final command

## Language choice

| Prefer | When |
| --- | --- |
| **zsh** | Wrappers, small installers, simple utilities |
| **bash/POSIX sh** | Must run where only sh is available |
| **Python 3** | Complex logic/options, data work, heavier control flow |
| **Lua** | Minimal footprint / high efficiency; typings only if scale warrants |
| **JS (node/bun/deno)** | Same niche as Python when the project is already JS-based |

Python: system `python3` from apt unless stated; no hard-coded venv hashbang; document deps / optional venv.

## Cross-refs

- **Scripts → bin build:** `agents/scripts-build.md`
- Languages: `agents/languages/<name>.md` (zsh, bash, python, lua, javascript, typescript, …)
- Web: `web-frontend.md`, `web-backend.md`
- Data: `postgres.md`, `mysql.md`, `sqlite.md`, `redis.md`, `mongodb.md`
- Runtime env: `docker.md`, `kubernetes.md`, `podman.md`, `qemu.md`
