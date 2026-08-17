# forge-nested-cli-separation_p0-plan — Lock Nested off user CLI

**Status:** ready  
**Plan:** [forge-nested-cli-separation](../plans/forge-nested-cli-separation.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-17

## Goal

Produce a **locked plan** for taking Nested out of the everyday user Forge CLI
bundle and shipping it only with **testing / developer tools**. Do **not**
implement the separation in this task — only inventory, decide, write the lock
into the plan, then hand off to P1.

## Acceptance

- [ ] Full inventory of Nested surfaces (CLI, help, install messages, user docs,
      agent FIRM strings, Makefile, live matrix, tests)
- [ ] **Entry point** locked (e.g. `forge test nested`, standalone script, or
      repo-only path) — one primary string agents will type
- [ ] **Ship rule** locked: what “everyday user bundle” excludes Nested, and how
      testing tools still get it
- [ ] **Compat** locked: hard break vs shim for `forge nested`
- [ ] Scope of `forge test` help grouping decided (Nested-only vs all test cmds)
- [ ] Plan file updated with locked decisions + refined P1 acceptance
- [ ] P1 task still accurate (edit if decisions change paths)
- [ ] No product code change required for P0; if a one-line plan typo fix is
      needed, keep it to docs/plan/tasks only

## Context for the next agent (complete + succinct)

### Operator intent (FIRM)

- Nested must **not** be part of what ships in the **user** Forge CLI product
  surface.
- Forge CLI is **primarily for the user**, not a general developer toolkit.
- Nested **should** ship with **testing tools**, not everyday user bundles.
- Work shape: **plan first, then separate** (this task = plan; P1 = separate).

### Current wiring (seed)

| Piece | Where |
| --- | --- |
| Harness | `scripts/forge/nested_wayland.py` — `cmd_nested` |
| Product CLI | `scripts/forge/forge` top-level `nested` subparser + `hoist_nested_action_flags` |
| Help | `scripts/forge/cli_help.py` lists `nested` in main Commands |
| Test CLI | `forge test live` (same binary); live matrix imports nest capability |
| Units | `tests/unit/cli/test_nested_wayland.py` |
| Make | `nested-start` / `stop` / `restart` / `status` → `./scripts/forge/forge nested …` |
| User doc | `docs/user/troubleshooting.md` recommends `forge nested restart` |
| Agent FIRM | HANDOFF / PRIORITY / testing.md — `forge nested run` preferred campaign entry |
| Install | `./install` symlinks full `forge` to `~/.local/bin/forge` (nested rides along) |

### Related locked product (do not re-litigate)

- Nest **behavior**: D022 + [forge-nested-isolation](../plans/forge-nested-isolation.md)
  (isolation, mon=1 default, `run` always stops). This plan is surface/packaging.
- Node CLI port of nest (CN14) is **later** and not required for separation.

### Design choices P0 must pick

1. New entry point string (primary).
2. Ship rule for user install vs testing tools.
3. `forge nested` hard break vs deprecation shim.
4. Whether help also demotes all of `forge test *` in the same slice.

### Recommended default stance (override only with reason)

- Clean break OK (active development; Nested is agent/dev, not released user API).
- Prefer folding under testing: **`forge test nested …`** keeps one binary for
  clone/dev, removes Nested from top-level user command list — unless inventory
  shows a cleaner standalone `forge-nested` for PATH hygiene.
- User Wayland reload story: logout/in for host tip; Nested only in CONTRIBUTING /
  testing docs.

### After P0

Hand off to
[forge-nested-cli-separation_p1-separate](./forge-nested-cli-separation_p1-separate.md)
with locked decisions written into the plan.

## Session note

**2026-08-17:** Task created from operator request. No design lock yet; implement
blocked until this P0 completes.
