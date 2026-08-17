# forge-nested-cli-separation_p0-plan — Lock Nested off user CLI

**Status:** done  
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

- [x] Full inventory of Nested surfaces (CLI, help, install messages, user docs,
      agent FIRM strings, Makefile, live matrix, tests)
- [x] **Entry point** locked: **`forge test nested <action> …`**
- [x] **Ship rule** locked: same install binary; Nested off user Commands + user
      docs; available via testing entry + Makefile
- [x] **Compat** locked: hard break top-level `forge nested` + migration stderr
- [x] Scope of `forge test` help: Nested-first; reword `test` row; drop Nested row
- [x] Plan file updated with locked decisions + refined P1 acceptance
- [x] P1 task accurate for implement
- [x] No product code change in P0

## Locked decisions (summary)

| Decision | Lock |
| --- | --- |
| Entry | `forge test nested …` (FIRM agent string) |
| Ship | Same `./install` forge binary; not in user product Commands/docs |
| Compat | Hard break; exit 2 + “use forge test nested” |
| Help | Drop top-level Nested; `test` covers live + nested retest |
| P2/P3 | Merged into P1 |

Full text: [plan](../plans/forge-nested-cli-separation.md).

## Session note

**2026-08-17:** P0 complete. Hand off to
[p1-separate](./forge-nested-cli-separation_p1-separate.md).
