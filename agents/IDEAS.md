# Ideas / parked decisions (not PRIORITY queue)

**Purpose:** things that are neither “do next” nor firmly dropped. Agents may
promote to PRIORITY or drop after a real need appears. Do **not** treat this
file as a work queue.

**Updated:** 2026-08-17

---

## Layout / apply UX

| Item | Why parked | Promote when |
| --- | --- | --- |
| CLI “nothing applied” wording when spine partially ran | Tiny copy polish; no clear false-ok message path locked after AL8 | A host job reports ok while structure/soft partially failed and wording misleads |
| Soft-only polish if structure green but soft thrashing (R014 class) | Cold structure (R036) green; soft residual is product (D019) | Soft still max-corrections / sticky open leaf on green forest and operator wants polish |

---

## Live coverage (optional)

| Item | Why parked | Promote when |
| --- | --- | --- |
| Open-heavy dual-mon `_forge-test-*` nest mon=2 | Not blocking daily driver; mon=1 nest + host mid-session already exercised; dual nest is expensive flake surface | Next dual-mon structure change or pre-release RC |
| L1 scale smoke (`gdisplays load default-no-scale` → restore `default` + `layout dev`) | Human/live; R017 code shipped; thrash class guarded L0 | Operator wants eyes-on reverse scale again |

---

## Lifecycle / bag health (optional residual)

| Item | Why parked | Promote when |
| --- | --- | --- |
| Per-window `windowSignals` / `actorSignals` → WindowAttach | Lifecycle plan scope complete (W1–W5, L8/L11); optional residual only | Disable/leak bug tied to per-window signal arrays, or a window-domain extract |
| Bag-API review `layout-apply-slot.js` (was PRIORITY optional after SM4) | SM1–SM7 + R036 + D044 shipped without bag pain; review without a failure is pure hygiene | Ownership bug, FCC C2 reshape needs slot bag API, or contracts row drift |

See [forge-lifecycle-abstractions.md](./plans/forge-lifecycle-abstractions.md) “Optional later”.

---

## Design prototypes (not product queue)

| Item | Why parked | Promote when |
| --- | --- | --- |
| MD1 HTML container-motion prototype | Old design track; not on PRIORITY; insert/DnD locks already landed (D032/TD1/D044) | Operator re-opens container-motion plan before Shell peel/move redesign |

---

## Product later (already have plans/blockers)

| Item | Home |
| --- | --- |
| Tab click-drag PR2–PR6 | [tab-click-drag](./plans/forge-tab-click-drag.md) — **only when operator asks**; PR1 shipped |
| TD4 tab-drag user-docs one-liner | [tab-chrome-drag](./plans/forge-tab-chrome-drag.md) — folds into click-drag PR6 |
| STACKED layouts | [forge-stacked-layouts.md](./plans/forge-stacked-layouts.md) |
| Resize + autotile | [plan](./plans/forge-resize-and-autotile.md) · [blocker](./blockers/resize-autotile-design.md) |
| FCC C2+ / strip `_layoutOp` | [FCC](./plans/forge-first-class-containers.md) — after apply honest (done); still P2+ product |
| CN13 Node PATH forge | [cli-node](./plans/forge-cli-node.md) — after apply thin client boring |

---

## Do not revive

| Item | Note |
| --- | --- |
| `Ctrl+Super+Esc` unfocus (FC2) | Abandoned; keybind unbound |
| Mode B as cold success | Forbidden |
| Personal `dev`/`t1` in live matrix | Use `_forge-test-*` only |
| Cross-mon TABBED/STACKED as product | **D044** — mon-local only; no spanning chrome |
| Overlay clear before all-hard | **D043** — spinner is not soft |
| Top-level `forge nested` as product | **P0 locked** — use `forge test nested`; hard break |
| Belt after bind / TILE-anywhere hard / mon-root PlaceNext map move | D039–D043 + R036 |
