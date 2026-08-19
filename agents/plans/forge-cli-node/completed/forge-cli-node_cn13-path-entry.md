# forge-cli-node_cn13-path-entry — Node PATH `forge`

**Status:** done  
**Plan:** [forge-cli-node](../plans/forge-cli-node.md) §CN13  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-18  
**Agent:** `grok-4.6` as 4.6 **med** (PATH + job runner)

## Goal

Make `cli/forge.mjs` the single PATH entry for user `forge`. Retarget
install symlink / ours-detect. Port or wrap `job_runner` so the Node
router owns durable mutators. Keep leftover Python commands via spawn
(especially `layout`). Do **not** put nest/live back on user `forge`
(D045 — they stay on `forge-test`).

## Acceptance

- [x] `cli/forge.mjs` exists (`#!/usr/bin/env node`), `chmod +x`, parses
      global `--color` / `--first` / `--version`, dispatches Node bodies
      or leftover Python
- [x] `_lib.zsh`: `forge_cli_repo_path` → `$repo/cli/forge.mjs` (or tiny
      `cli/forge` shebang wrapper); `forge_cli_bin_is_ours` matches
      `*/cli/forge` and `*/cli/forge.mjs`; `install-origin.json` `"cli"`
      field updated
- [x] `./install` retargets `~/.local/bin/forge` → Node entry; **one**
      PATH entry only (no dual Python+Node symlinks)
- [x] Live: `forge ping` ok; `forge layout list` works (Python body via
      spawn is fine)
- [x] `forge_cli_bin_is_ours` true for ours; foreign `~/.local/bin/forge`
      still refused
- [x] Job runner usable from Node router (prefer faithful port
      `cli/job-runner.mjs` + Vitest from `test_job_runner.py`; wrap OK if
      port blocked mid-slice — say so in session note)
- [x] Mutators still durable by default (`run` / `run-steps` / layout
      apply / install family); worker argv built by Node router
- [x] Docs: `scripts/forge/README.md`, DESIGN CLI path, `project.md`
      jobs code path
- [x] `cli/README.md` no longer says “until CN13”
- [x] Guards green (Vitest cli + job-runner; pytest leftovers that still
      apply)

## Context for the next agent (complete + succinct)

### Today (pre-CN13)

| Piece | Path / behavior |
| --- | --- |
| PATH | `~/.local/bin/forge` → `scripts/forge/forge` (Python router) |
| Node bodies | `cli/*.mjs` via Python `exec_cli` (CN0–CN6) |
| Jobs | `scripts/forge/job_runner.py`; worker often Python then exec Node |
| Nest/live | **`forge-test` only** (D045). User `forge test`/`nested` hard-break |
| Layout | Still Python (`layout_apply_client`, plan, etc.) — **do not** port planner to `cli/` |
| Install helpers | `forge_cli_repo_path` = `…/scripts/forge/forge`; ours-detect same shape |

### Do

1. `cli/forge.mjs` — global flags + dispatch table to existing
   `cli/<cmd>.mjs` (ping/tree/focus/…/launch/run/run-steps/keybind) or
   `child_process.spawnSync(python3, [scripts/forge/forge, …])` for
   leftovers (`layout`, `install`/`update`/`uninstall`, `thrash`,
   `save-session-layout`, `jobs` if not yet Node, hard-break messages
   for `test`/`nested` if those parsers move)
2. `_lib.zsh` path + ours-detect + origin `"cli"` in the **same** slice
3. Port/wrap `job_runner` so Node can `maybe_run_as_job` / spawn worker
4. Shebang + executable bit
5. Docs listed in Accept

### Do not

- Two PATH entries
- Port `layout_plan` / ApplyLayout planner into `cli/`
- Flip root `package.json` `"type"` casually
- Put `nested` / `live` / `test` product verbs back on user `forge`
- Close durable-agent ghostty windows
- Commit/push unless user asks
- Delete `scripts/forge/forge` yet (that is CN15 after spawn is solid)

### Test

```bash
# Units (adjust to what landed)
npm test -- tests/unit/cli/
# If job-runner ported:
# npm test -- tests/unit/cli/job-runner.test.js
# Pytest only for leftovers still imported
python3 -m pytest tests/unit/cli/test_job_runner.py tests/unit/cli/test_node_exec.py -q

# Install retarget (dev kit OK)
./install --kit=vim

# Live product surface
forge ping
forge layout list
# Ours-detect (zsh):
# source scripts/forge/_lib.zsh && forge_cli_bin_is_ours && echo OURS

# Optional mutator smoke (FORGE_JOB=0 foreground if preferred):
# forge get tiling-mode-enabled
```

### Risks

- Job single-flight / HUP / attach parity drift if port is shallow — prefer
  translate tests from `test_job_runner.py`
- Install refuses foreign bin — keep that gate
- Stale docs still saying Python PATH after retarget

## Session note

**2026-08-18 CN13 landed (faithful job-runner port, not wrap).**

Landed paths:
- `cli/forge.mjs` — PATH entry (`#!/usr/bin/env node`, +x). Global
  `--color` / `--first` / `--version`. Dynamic import Node bodies.
  `isMainModule` realpath so `~/.local/bin/forge` symlink runs.
- `cli/job-runner.mjs` — D021 schema port of `job_runner.py`.
- `_lib.zsh` — `forge_cli_repo_path` → `$repo/cli/forge.mjs`; ours
  matches `*/cli/forge(.mjs)` **and** stale `*/scripts/forge/forge`
  (so install retargets); origin `"cli": "cli/forge.mjs"`.
- Docs: `cli/README.md`, `scripts/forge/README.md`, DESIGN CLI path +
  jobs code, `project.md` jobs path, D036 PATH sentence.

Worker argv shape (Node router builds it):
`[process.execPath, $repo/cli/forge.mjs, …cleaned]`
(`--detach`/`--foreground`/`--color` stripped; `--first` already
folded). Leftover Python spawn: `python3 scripts/forge/forge …` with
`FORGE_JOB=0` (Node owns job wrap). Hard-break `test`/`nested` exit 2.

Tests:
- Vitest `tests/unit/cli/` **169 PASS** (incl. `forge.test.js` 21,
  `job-runner.test.js` 29)
- pytest `test_job_runner.py` + `test_node_exec.py` +
  `test_install_safe_replace.py` **56 PASS** (ours-detect + foreign
  refuse units in the last file)

Live accept (`./install --kit=vim`):
- symlink `~/.local/bin/forge` → `cli/forge.mjs` (one PATH entry)
- `forge ping` ok apiVersion 10; `forge layout list` ok
- `forge --version` → `forge fc5`; `forge get tiling-mode-enabled` ok
- ours-detect **OURS**; origin `"cli": "cli/forge.mjs"`
- `forge test` / `forge nested` exit 2
- nest `running: False`

Leftovers still Python (spawn): `layout`, install/update/uninstall,
`jobs`, `thrash`, `save-session-layout`, help. `scripts/forge/forge`
kept for CN15.

Risks:
- Node mutator lock uses O_EXCL sidecar vs Python `fcntl.flock` on the
  same `mutator.lock` payload. Safe for PATH `forge` (Python leftover
  spawn sets `FORGE_JOB=0`). Direct `python3 scripts/forge/forge layout`
  in parallel with a Node job could race until CN15.
- `lib/extension/run-steps.js` typeless-package warning only when
  loading `run`/`run-steps`/`launch` (not ping/layout). Do **not** flip
  root `package.json` `"type"`.
