# forge (lukebmay) — active priorities

**Updated:** 2026-08-29 — **P6 remainder done.** Leftover: DnD execute
→ OpSet (not a thin path). **Cross-session handoff:**
[`HANDOFF.md`](./HANDOFF.md) ← **read first**
**Lens:** portable kernel (TOM/RuleSet/OpSet/action ids); adapters
**extend** that kernel; T6 in `lib/epochs/`; FLOATS off TILES.
**Branch:** **`master`**. **Push:** only when human asks.

Design = [`design.md`](./design.md) · layers =
[`plans/forge-firm-abstractions/layers.md`](./plans/forge-firm-abstractions/layers.md)
· history = [`design/CHANGELOG.md`](./design/CHANGELOG.md) (D079–D091).
Scan merge =
[`plans/forge-firm-abstractions/explore/07-plan-scan.md`](./plans/forge-firm-abstractions/explore/07-plan-scan.md).

---

## Active next (ordered)

1. **P0** — **P6 DnD leftover** (optional pickup) — wire completed-drop
   **execute/commit** onto Mark 2 Join/Move (TILES only) without rewriting
   `drag-drop.js` gesture/preview. If it is still a redesign, leave it.
   ([`P6.md`](./plans/forge-firm-abstractions/P6.md)
   · [`HANDOFF`](./HANDOFF.md)).
   FLOAT windows stay in FLOATS, not under a MONITOR.

Do **not** start pinned-slots design until the operator schedules that
meeting. Do **not** keep ding / Super+2 / vinyl / D069 tip as next work.

**Agents:** Default implement = **Grok 4.5**. Architecture reshape of a
slice → 4.6.

---

## Keep-parallel (not a work row)

Use when a slice needs a live gate. Do not expand as the P0 campaign.

| Item | Path |
| --- | --- |
| AI live matrix | [forge-ai-live-test-matrix.md](./plans/forge-ai-live-test-matrix.md) |
| Wayland RC runbook | [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) |

---

## Parked post-refactor

| Item | Path | Gate |
| --- | --- | --- |
| CN14 / CN15 leftover Python | [forge-cli-node.md](./plans/forge-cli-node.md) | after kernel/import |
| yuiop resize / autotile | [forge-resize-and-autotile.md](./plans/forge-resize-and-autotile.md) · [blocker](./blockers/resize-autotile-design.md) | hard human design lock |
| multi-ws pinned slots | [d0](./plans/forge-pinned-slots-multi-ws/d0-discussion.md) · [blocker](./blockers/pinned-slots-multi-ws-design.md) | scheduled design meeting |
| layout chaos nest queue | [forge-layout-chaos-nest-queue.md](./plans/forge-layout-chaos-nest-queue.md) | append on failure |
| D069 host tip verify | design.md § tab peer geometry | eyes-on only |
| Apply planner → TOM | P5c / import-map | later; GetTree stays Surface |

---

**FIRM:** proto brake is `cd prototypes/container-motion && npm test`.
Green + wrong desk ⇒ paint, not the TOM. Glossary =
[`mark2.md`](../prototypes/container-motion/src/opsets/mark2.md).
Shell hunts: `forge log` only. Nest for code→reload. See
[testing.md](./testing.md).

Archive: [`plans/archived/completed/`](./plans/archived/completed/).
Abandoned: [`plans/archived/abandoned/`](./plans/archived/abandoned/).
Ideas (not a queue): [`ideas/IDEAS.md`](./ideas/IDEAS.md).
