# forge (lukebmay) — active priorities

**Updated:** 2026-08-27 — **begin P1a** (TOM lift)
**Cross-session handoff:** [`HANDOFF.md`](./HANDOFF.md) ← **read first**
**Lens:** TOM+atomics core; RuleSet settle; Mark 2 OpSet; one keybind table.
**Branch:** **`master`**. **Push:** only when human asks.

Design = [`design.md`](./design.md) · layers =
[`plans/forge-firm-abstractions/layers.md`](./plans/forge-firm-abstractions/layers.md)
· history = [`design/CHANGELOG.md`](./design/CHANGELOG.md) (D079, D080).
Scan merge =
[`plans/forge-firm-abstractions/explore/07-plan-scan.md`](./plans/forge-firm-abstractions/explore/07-plan-scan.md).

---

## Active next (ordered)

1. **P0** — **P1a TOM lift**
   ([`forge-firm-abstractions.md`](./plans/forge-firm-abstractions.md)
   · [`HANDOFF`](./HANDOFF.md)).
   `prototypes/container-motion/src/tom/` → `lib/tom/`; proto tests
   import it; `cd prototypes/container-motion && npm test` green. No
   Forge `tree.js` yet. Then **P1b** `lib/rulesets/`, **P1c**
   `lib/keybinds/`.

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

---

**FIRM:** proto brake is `cd prototypes/container-motion && npm test`.
Green + wrong desk ⇒ paint, not the TOM. Glossary =
[`mark2.md`](../prototypes/container-motion/src/opsets/mark2.md).
Shell hunts: `forge log` only. Nest for code→reload. See
[testing.md](./testing.md).

Archive: [`plans/archived/completed/`](./plans/archived/completed/).
Abandoned: [`plans/archived/abandoned/`](./plans/archived/abandoned/).
Ideas (not a queue): [`ideas/IDEAS.md`](./ideas/IDEAS.md).
