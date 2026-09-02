# Plan scan — merge

**Status:** MERGE: complete
**As of:** 2026-08-27
**Sources:** every `scan/items/*.md`. Inventory pending = 0.

L0 accepted these verdicts. Archive moves happen in the same session.

## Verdict table

| Item | Verdict | Destination |
| --- | --- | --- |
| forge-firm-abstractions | — | this plan (live) |
| forge-container-motion-design | **pull-in-refactor** | archive completed (absorbed) |
| forge-canonical-contracts | **pull-in-refactor** | archive completed (absorbed) |
| forge-lifecycle-abstractions | **pull-in-refactor** | archive completed (absorbed) |
| forge-tab-peer-geometry | **pull-in-refactor** | archive completed; D069 stays in design.md |
| forge-x11-green-sleep-lock-shield | **pull-in-refactor** | archive completed; `fromLock` shield → Host/epoch |
| forge-resize-and-autotile | **post-refactor** | live, PRIORITY parked |
| blocker-resize-autotile-design | **post-refactor** | stays open |
| forge-pinned-slots-multi-ws | **post-refactor** | live, PRIORITY parked |
| blocker-pinned-slots-multi-ws-design | **post-refactor** | stays open |
| forge-cli-node | **post-refactor** | live; CN14 then CN15 |
| forge-layout-chaos-nest-queue | **post-refactor** | live, PRIORITY parked |
| forge-observability-hardening | **close** | archive completed |
| forge-enable-ding-percent-thrash | **close** | archive completed |
| forge-layout-enable-open-miss | **close** | archive completed |
| forge-layout-vinyl-inkscape-float | **close** | archive completed |
| forge-open-min-dnd-cold-wayland | **close** | archive completed |
| forge-open-min-tab-walk-float | **close** | archive completed |
| forge-min-size-floor | **close** | archive completed |
| blocker-d049-tiny-env-nautilus | **close** | blockers/completed |
| blocker-oh-ws-orphan-host-verify | **close** | blockers/completed |
| forge-ws-super2-bounce | **abandon** | archive abandoned |
| forge-ai-live-test-matrix | **keep-parallel** | live harness, not P0 implement |
| forge-wayland-rc-test-suite | **keep-parallel** | live runbook, not P0 implement |
| ideas-IDEAS | **close** (file stays) | parking lot |
| archive-completed-audit | **close** | no reopen |
| archive-abandoned-audit | **close** | dir was empty; Super+2 is first occupant |

## Pull-in-refactor (must not lose)

| From | Absorb |
| --- | --- |
| container-motion | proto `src/tom/` → product TOM; `mark2.md` glossary; `npm test` brake |
| canonical-contracts | job→API catalog; D024–D026; no third settle brain |
| lifecycle | bags as Host lifetime |
| tab-peer-geometry | D069 presenter: shared slot, visible-first, no focus-path all-peer reassert |
| x11-green-sleep | while-locked `fromLock` shield TTL; unlock shortens; H1 reapplies under shield |

## Post-refactor queue

1. CN14 / CN15 (`forge-cli-node`)
2. Resize / autotile — hard human design lock
3. Pinned slots multi-ws — scheduled design meeting (not D044)
4. Chaos nest queue — append on failure
5. D069 host tip verify — eyes-on only

## Keep-parallel

Live matrix + Wayland RC: use during kernel lift. Do not grow them as
refactor workstreams.

## PRIORITY rebuild

See [`PRIORITY.md`](../../PRIORITY.md) — written from this table.

## Do-not-rescan traps

- Super+2 bounce with Forge **disabled**
- Archived “active” headers are label drift
- `migrated-tasks/` is not a queue
- Overnight HDMI on `green` is not a queue item
- min-size env floor in code is **256×144**, not the old 320×240 plan text
