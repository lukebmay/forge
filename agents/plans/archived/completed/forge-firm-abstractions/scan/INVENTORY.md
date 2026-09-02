# Plan-scan inventory

**As of:** 2026-08-27
**Pickup:** an id is **done** iff `items/<id>.md` exists. Re-launch only
missing ids. Scheme: [00-pipeline.md](./00-pipeline.md).

Item file exists? treat as done even if this table still says `pending`.

## Active plan spines (`agents/plans/*.md`)

| id | Path | Stated status (pre-scan) | Batch | Item file |
| --- | --- | --- | --- | --- |
| forge-firm-abstractions | [forge-firm-abstractions.md](../../forge-firm-abstractions.md) | this meeting | — | skip (self) |
| forge-container-motion-design | [forge-container-motion-design.md](../../forge-container-motion-design.md) | design; proto paused | B01 | pending |
| forge-canonical-contracts | [forge-canonical-contracts.md](../../forge-canonical-contracts.md) | IC0–IC3 done; IC4 skip | B01 | pending |
| forge-lifecycle-abstractions | [forge-lifecycle-abstractions.md](../../forge-lifecycle-abstractions.md) | bags done; optional leftover | B01 | pending |
| forge-tab-peer-geometry | [forge-tab-peer-geometry.md](../../forge-tab-peer-geometry.md) | Accepted FIRM D069 | B01 | pending |
| forge-resize-and-autotile | [forge-resize-and-autotile.md](../../forge-resize-and-autotile.md) | discussion; no implement | B01 | pending |
| forge-cli-node | [forge-cli-node.md](../../forge-cli-node.md) | CN0–CN6+CN13 done; CN14/15 later | B03 | pending |
| forge-observability-hardening | [forge-observability-hardening.md](../../forge-observability-hardening.md) | OH1–OH3 done; soft leftover | B03 | pending |
| forge-ai-live-test-matrix | [forge-ai-live-test-matrix.md](../../forge-ai-live-test-matrix.md) | harness shipped; living | B03 | pending |
| forge-wayland-rc-test-suite | [forge-wayland-rc-test-suite.md](../../forge-wayland-rc-test-suite.md) | living procedure | B03 | pending |
| forge-enable-ding-percent-thrash | [forge-enable-ding-percent-thrash.md](../../forge-enable-ding-percent-thrash.md) | agent done; host verify | B02 | pending |
| forge-layout-enable-open-miss | [forge-layout-enable-open-miss.md](../../forge-layout-enable-open-miss.md) | agent done; host verify | B02 | pending |
| forge-layout-vinyl-inkscape-float | [forge-layout-vinyl-inkscape-float.md](../../forge-layout-vinyl-inkscape-float.md) | D051 landed; host verify | B02 | pending |
| forge-ws-super2-bounce | [forge-ws-super2-bounce.md](../../forge-ws-super2-bounce.md) | likely not Forge; host leftover | B02 | pending |
| forge-layout-chaos-nest-queue | [forge-layout-chaos-nest-queue.md](../../forge-layout-chaos-nest-queue.md) | living empty queue | B02 | pending |
| forge-open-min-dnd-cold-wayland | [forge-open-min-dnd-cold-wayland.md](../../forge-open-min-dnd-cold-wayland.md) | ready for implement | B02 | pending |
| forge-open-min-tab-walk-float | [forge-open-min-tab-walk-float.md](../../forge-open-min-tab-walk-float.md) | (no status header) | B02 | pending |
| forge-min-size-floor | [forge-min-size-floor.md](../../forge-min-size-floor.md) | shipped agent; soft human | B02 | pending |
| forge-x11-green-sleep-lock-shield | [forge-x11-green-sleep-lock-shield.md](../../forge-x11-green-sleep-lock-shield.md) | next; optional overnight | B03 | pending |

## Plan dirs without a matching live spine (or extra)

| id | Path | Stated status | Batch | Item file |
| --- | --- | --- | --- | --- |
| forge-pinned-slots-multi-ws | [forge-pinned-slots-multi-ws/d0-discussion.md](../../forge-pinned-slots-multi-ws/d0-discussion.md) | D0 parked | B01 | pending |

## Open blockers

| id | Path | Stated status | Batch | Item file |
| --- | --- | --- | --- | --- |
| blocker-d049-tiny-env-nautilus | [d049-tiny-env-nautilus.md](../../../blockers/d049-tiny-env-nautilus.md) | open | B02 | pending |
| blocker-oh-ws-orphan-host-verify | [oh-ws-orphan-host-verify.md](../../../blockers/oh-ws-orphan-host-verify.md) | done (follow-ups filed) | B03 | pending |
| blocker-pinned-slots-multi-ws-design | [pinned-slots-multi-ws-design.md](../../../blockers/pinned-slots-multi-ws-design.md) | open | B01 | pending |
| blocker-resize-autotile-design | [resize-autotile-design.md](../../../blockers/resize-autotile-design.md) | open | B01 | pending |

## Ideas

| id | Path | Stated status | Batch | Item file |
| --- | --- | --- | --- | --- |
| ideas-IDEAS | [IDEAS.md](../../../ideas/IDEAS.md) | parked list | B04 | pending |

## Archive audit (not a reopen queue)

| id | Path | Stated status | Batch | Item file |
| --- | --- | --- | --- | --- |
| archive-completed-audit | `agents/plans/archived/completed/` (~40 spines + migrated-tasks/81) | archived | B04 | pending |
| archive-abandoned-audit | `agents/plans/archived/abandoned/` | empty as of 2026-08-27 | B04 | pending |

## Batch assignment (L1)

| Batch | Ids | Lens |
| --- | --- | --- |
| **B01** | container-motion, canonical-contracts, lifecycle, tab-peer-geometry, resize-and-autotile, pinned-slots + both design blockers | option 2 kernel / constraints to absorb |
| **B02** | ding, enable-open-miss, vinyl-inkscape, super2, chaos-queue, open-min-dnd, open-min-tab-walk, min-size-floor, blocker-d049 | residuals: close vs post-refactor vs absorb strategy |
| **B03** | cli-node, observability, ai-live-matrix, wayland-rc, x11-green-sleep, blocker-oh-ws-orphan | harness / CLI / host — parallel vs park |
| **B04** | ideas, archive-completed-audit, archive-abandoned-audit | no shadow queue; flag false-complete or should-reopen |

## Skip

- `forge-firm-abstractions` (this meeting)
- `blockers/completed/*` (already done)
- `blockers/README.md`
- Domain explore notes `explore/01–06` (different pipeline)
