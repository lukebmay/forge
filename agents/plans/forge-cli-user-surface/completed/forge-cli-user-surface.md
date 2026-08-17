# forge-cli-user-surface — Pull all testing utilities out of user `forge`

**Status:** done
**Plan:** [forge-cli-user-surface](../../forge-cli-user-surface.md)
**Branch:** master (default)
**Blocker:** (none)
**Agent:** **4.6 high** — plan lock then implement (architecture / product surface)
**Updated:** 2026-08-17

## Goal

Make the delivered **`forge` command user-centric only**. Remove nested retest,
live matrix, and **all** other testing/dev harness utilities from the ordinary
user CLI surface. Dev/test CLI is a **separate** entry not delivered by a
normal install.

## Acceptance

- [x] P0: inventory + locked decisions on plan (entry name, ship rule, compat,
  module layout, docs scope, non-goals)
- [x] User `forge help` / Commands: no test/dev harness rows (`test`, nested,
  live, or successors)
- [x] User-delivered `forge` cannot productively run nest / live matrix (hard
  break + migration line, or parser absent)
- [x] Working documented dev/test entry for nest + live matrix (and any other
  harness moved with them)
- [x] Agent FIRM, Makefile, CONTRIBUTING, units rewritten to new entry
- [x] L0 units green for touched CLI surface; nest campaign still ends
  `running: False` when exercised
- [x] D022 nest isolation + live case semantics unchanged (packaging only)

## Context for the next agent (complete + succinct)

- **Locked (D045):** user `forge` = product. Nest + live = `forge-test`.
- **Always-works entry:** `./scripts/forge/forge-test`
- **Nest FIRM:** `./scripts/forge/forge-test nested run -- …` (auto stop)
- **Live FIRM:** `./scripts/forge/forge-test live probe|plan|run …`
- **Opt-in PATH:** `./install --with-test-cli` / `make install-test-cli`
- **Hard break:** `forge test` / `forge nested` → exit 2 + migration
- **Do not** teach `forge test` or top-level `forge nested`
- **Do not** redesign D022 / D039–D044; no nest Node port (CN14 later)

## Session note

**2026-08-17 done.**

**Locked:** `forge-test`; clone `./scripts/forge/forge-test`; normal install
does not ship it; `--with-test-cli` opt-in; hard break on user `forge test` /
`forge nested`. Modules stay under `scripts/forge/`; runners in `test_cli.py`
+ `live_cli.py`. Thrash stays product. D045.

**Files:** `scripts/forge/forge-test` (new) · `test_cli.py` · `live_cli.py` ·
user `forge` stripped · `cli_help.py` · `job_runner.py` · `nested_wayland.py`
· `live_matrix.py` · `install.zsh` · `_lib.zsh` · `rebuild.zsh` ·
`migrate-from-ego.zsh` · Makefile · CONTRIBUTING · `agents/testing.md` ·
HANDOFF · PRIORITY · project.md · DECISIONS D045 · DESIGN · units.

**Tests:** pytest `test_nested_wayland` + `test_cli_help` + `test_job_runner`
+ `test_live_matrix` — **108 passed**. `forge-test live list` 23 cases.
`forge-test nested status` **running: False**. Doctor can_nested=True.
No nest campaign started this slice.

**Risks:** agents must use clone path unless `--with-test-cli`; some historical
HANDOFF shipped recipes still show old strings.

**Entry strings (FIRM):**

```bash
./scripts/forge/forge-test nested run -- forge ping
./scripts/forge/forge-test nested status   # running: False
./scripts/forge/forge-test live probe
./scripts/forge/forge-test live plan --from-work <hint>
./scripts/forge/forge-test live run --from-work <hint>
```
