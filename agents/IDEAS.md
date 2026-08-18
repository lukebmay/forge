# Ideas / parked decisions (not PRIORITY queue)

**Purpose:** things that are neither “do next” nor firmly dropped. Agents may
promote to PRIORITY or drop after a real need appears. Do **not** treat this
file as a work queue.

**Updated:** 2026-08-18 (PR7 shipped; CN13 parked for next session)

---

## Product later (promote only with need or ask)

| Item | Home | Note |
| --- | --- | --- |
| **CN13** Node PATH `forge` (+ CN14 nest/live, CN15 delete Python CLI) | [cli-node](./plans/forge-cli-node.md) | **Next session** — HANDOFF prep table; after CN0–CN6 |
| Ratio / autotile (yuiop) | [plan](./plans/forge-resize-and-autotile.md) · [blocker](./blockers/resize-autotile-design.md) | **Hard** human design lock before any implement |

---

## Dropped from this file (2026-08-18) — do not re-queue without new evidence

| Item | Why gone |
| --- | --- |
| Tab click-drag **PR7** docs | **Shipped** (D046) · [completed](./plans/forge-tab-click-drag/completed/forge-tab-click-drag_pr7-docs.md) |
| Tab click-drag PR2–PR6 as “later” | **Shipped** through PR15 |
| TD4 docs one-liner (separate) | Folds into PR7 if docs run; not its own queue row |
| FCC C2+ / strip `_layoutOp` | **Shipped** (C2–C5 + P3) |
| FCC Wave Z “when promoted” | Z0/Z1 **shipped** (D030); kit chord leftovers live in FCC REG only |
| STACKED product D0 / SL6 polish | Phase 1 + SL5 live **done**; no open product gap |
| Session restore vs ApplyLayout | SM/ApplyEpoch honest; restore is a separate epoch by design — no open failure |
| Freeze Python `layout_plan.py` as oracle | Status quo (D036: no `cli/` layout port); not a task |
| Soft-only polish (R014 class) | Soft residual is product (D019); open a task only on a live burn |
| L1 scale smoke | R017 + L0 guards shipped; eyes-on is operator choice, not a queue item |
| Dual-mon open-heavy nest mon=2 | Coverage preference, not work; nest mon=2 already used when needed |
| Bag-API review `layout-apply-slot.js` | Hygiene without failure |
| Per-window signals → WindowAttach | Lifecycle scope complete; residual only on a leak bug |
| MD1 HTML container-motion prototype | Superseded by D032 / TD1 / D044 locks |
| CLI “nothing applied” wording | Tiny copy; no locked false-ok message path |

---

## Do not revive

| Item | Note |
| --- | --- |
| `Ctrl+Super+Esc` unfocus (FC2) | Abandoned; keybind unbound |
| Mode B as cold success | Forbidden |
| Personal `dev`/`t1` in live matrix | Use `_forge-test-*` only |
| Cross-mon TABBED/STACKED as product | **D044** — mon-local only; no spanning chrome |
| Overlay clear before all-hard | **D043** — spinner is not soft |
| Top-level `forge nested` / `forge test` as product | **Rejected** — `./scripts/forge/forge-test` only |
| Belt after bind / TILE-anywhere hard / mon-root PlaceNext map move | D039–D043 + R036 |
| Silent `_layoutOp` nested peel | P3 deleted `_flattenLayoutParentToWindows` |
| Hover-spinner / tab-click residuals as open work | None unless post-R036 overlay/click repro |
