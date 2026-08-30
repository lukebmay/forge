# forge (lukebmay) — active priorities

**Updated:** 2026-08-30 — **S8 landed** (vinyl open-miss + CENTER wrap).
**P0** H5 TABBED TOP/BOTTOM. Host needs logout for this tip. **Do not
resave loadouts.**
**Plan:**
[forge-live-layout-dnd-proof](./plans/forge-live-layout-dnd-proof.md)
**Cross-session handoff:** [`HANDOFF.md`](./HANDOFF.md) ← **read first**
**Lens:** portable kernel; **live = POJO Forest** (D092); **AGREE or
RESYNC toward REALITY** (D093). **Branch:** **`master`**. **Push:** only
when human asks.

Design = [`design.md`](./design.md) · D092 · D093 · D094 · layers =
[`plans/forge-firm-abstractions/layers.md`](./plans/forge-firm-abstractions/layers.md)
· history = [`design/CHANGELOG.md`](./design/CHANGELOG.md) · arch =
[`plans/forge-live-layout-dnd-proof/architecture-verdict-2026-08-29.md`](./plans/forge-live-layout-dnd-proof/architecture-verdict-2026-08-29.md).

---

## Active next (ordered)

1. **[forge-live-layout-dnd-proof](./plans/forge-live-layout-dnd-proof.md)
   #H5** — TABBED TOP/BOTTOM nest; then toggleTabStack nest. Optional:
   archive cutover + agree-resync. Host `vinyl` / CENTER eyes-on after
   logout (not from agents).
2. Do **not** start pinned-slots / resize-autotile until those meetings.
   Do **not** revive hybrid dual-run as steady state.

**Agents:** Default implement = **Grok 4.5**. Architecture reshape of a
slice → **4.6** (+ high/`xhigh` reasoning when reshaping TILES/live Forest).

---

## Keep-parallel (not a work row)

| Item | Path |
| --- | --- |
| Live layout + DnD proof (P0; host PASS; H5 nest leftover) | [forge-live-layout-dnd-proof.md](./plans/forge-live-layout-dnd-proof.md) |
| Live TOM cutover (C7 code; archive when operator wants) | [forge-live-tom-cutover.md](./plans/forge-live-tom-cutover.md) |
| Agree/resync (R0–R4+R6; live proof PASS; archive with cutover) | [forge-tom-agree-resync.md](./plans/forge-tom-agree-resync.md) |
| AI live matrix | [forge-ai-live-test-matrix.md](./plans/forge-ai-live-test-matrix.md) |
| Wayland RC runbook | [forge-wayland-rc-test-suite.md](./plans/forge-wayland-rc-test-suite.md) |

---

## Parked post-refactor

| Item | Path | Gate |
| --- | --- | --- |
| CN14 / CN15 leftover Python | [forge-cli-node.md](./plans/forge-cli-node.md) | after leftover H5 |
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
