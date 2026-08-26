# Task: Quiet `forge install` checklist UX

**Status:** Done  
**Priority:** P0 UX (user-requested this session)  
**Scope:** install path output + prompts only (no tiling behavior change)

## Problem

`forge install` / `./install` is too noisy and too interactive:

- Stacked headers, repo/lineage/session dumps, make chatter, per-key host-defaults lines
- Confirms for routine in-place replace (user always accepts defaults)
- User must understand lineage/temp/schemas/HUP to feel safe

## Goals

1. **No interactive prompts** for routine paths (fresh install, jcrussell in-place update). Accept safe defaults.
2. Prompt **only when important** (e.g. true destructive surprise). EGO migrate may proceed with auto-backup + one-line note (no prompt), since defaults are always accepted.
3. **Concise checkmark checklist** for install units — human can scan success/fail without reading system internals.
4. Suppress nested tool noise (`make`, npm, gsettings) unless a step fails (then dump the log).
5. Final summary one short line: version + where installed + shell reloaded or not.

## Target UX (shape)

```text
forge install
  ✓ Build
  ✓ Install extension
  ✓ Enable
  ✓ Host defaults
  ✓ CLI
  ✓ Reload shell
done  v49-…  (~/.local/share/gnome-shell/extensions/forge@…)
```

On failure:

```text
  ✗ Build
error: …
(show captured make/npm log tail)
```

Optional verbose: `--verbose` / `FORGE_VERBOSE=1` restores detailed forge_info lines for debugging.

## Files likely touched

| Path | Change |
| --- | --- |
| `scripts/forge/_lib.zsh` | `forge_step_*` checklist helpers; quiet run helper; confirm default skip for routine |
| `scripts/install.zsh` | Drive checklist; drop banner spam |
| `scripts/forge/update-jcrussell.zsh` | Quiet by default; no confirm when defaults OK |
| `scripts/forge/install-jcrussell.zsh` | Quiet build/install steps; capture make output |
| `scripts/forge/apply-host-defaults.zsh` | One step result (or per-key only if verbose) |
| `scripts/forge/README.md` | Brief note on quiet install + `--verbose` |

## Acceptance

- [x] `./install` / `forge install` on jcrussell tree: no Y/n prompts
- [x] Output is primarily a short ✓/✗ checklist of install units
- [x] Failed step shows error + useful log; success is quiet except checklist + done line
- [x] EGO path still safe (backup) without requiring user literacy
- [x] `--verbose` (or `FORGE_VERBOSE=1`) available for old chatter when debugging
- [x] Existing flags still work: `--no-restart`, `--prod`, `--save`, `--force`, `--no-host-defaults`
- [x] No regression to install correctness (files land, enable, origin, CLI symlink)

## Non-goals

- Changing UUID / install destination
- Personal-fork / remotes
- Workon / tiling code

## Session note

**Shipped (Task Force A):**

- `_lib.zsh`: `forge_is_verbose` / `forge_is_quiet` (`FORGE_INSTALL_QUIET=1`); quiet `forge_info`/`forge_ok`/`forge_hdr`; `forge_step_ok|fail|skip|warn`; `forge_run_quiet` + `forge_log_tail`; `forge_confirm` auto-yes when `FORGE_FORCE` or quiet; `--verbose`/`-v` in `forge_parse_common_args`.
- `scripts/install.zsh`: checklist driver; always `FORGE_FORCE=1`; orchestrates Build / Install extension / Enable / Host defaults / CLI / Reload shell (skips marked with `–`); EGO path: one-line note + quiet `switch-to-jcrussell` as Migrate; `done  <version-name>  (<ext dir>)`.
- Nested chatter silenced via `FORGE_INSTALL_QUIET` (apply-host-defaults per-key lines, make/npm under `forge_run_quiet`).
- `forge install` CLI: forwards `--verbose`, suppresses origin/exec noise unless verbose.
- README note on quiet default + `--verbose`.

**Task Force B (verify):** **AGREE** after tiny fixes.

- Reviewed diff + helpers; `zsh -n` OK; helper unit checks; smoke `./install --no-restart --skip-npm` → checklist, exit 0, no prompts.
- Fixed: soft steps (Enable-when-HUP, Host defaults, Reload theme) used `forge_run_quiet` → red fatal-looking error on expected soft fails → added `forge_run_capture` (silent status).
- Fixed: CLI checklist always ✓ even when `forge_install_cli_bin` refused foreign `~/.local/bin/forge` (write_origin soft-returns 0) → check `forge_cli_bin_is_ours` + origin file.

**Residual risks:**
- Enable soft-warn when pre-HUP enable fails (retries after reload); no error dump after B fix.
- Host defaults / CLI still non-fatal on failure (warn step).
- Standalone `update-jcrussell.zsh` without `--force` still prompts (only `./install` / `forge install` forced quiet).
- EGO migrate is one “Migrate” checklist unit; Reload shell ✓ after migrate is assumed from switch success (Wayland may still need logout).
- `forge_warn` still prints in quiet mode (PATH hints after CLI, `--no-restart` note) — intentional for important warnings.
- `forge_confirm` + `FORGE_FORCE` always yes even if `FORGE_CONFIRM_DEFAULT=no` (force semantics).

**2026-07-27 close:** Already shipped + B AGREE. Moved to `agents/tasks/completed/`.
