# forge-layout-mon-order-x11-reversed

**Status:** done  
**Priority:** P1 (after action pipeline reliability)  
**Plan:** none (standalone follow-up)  
**Created:** 2026-08-06  
**Host:** black — X11, dual 4K  

## Problem

On **X11**, `forge layout dev` applied a layout with **monitor order reversed** from
what the profile / operator expects (L↔R mon roles flipped relative to the intended
dev layout).

Operator report (2026-08-06): now on X11; layout dev “reversed the monitor order
from what it should be.” File for later — do **not** dig in during action-pipeline.

## Context

- Earlier mon L/R **pane** order work: [completed/forge-layout-mon-order.md](./completed/forge-layout-mon-order.md)
  (`ensure_order` for mon-level children). That is **within-mon** child order, not
  which monitor is mon0 vs mon1 in profile application.
- Claim order history: [layout-mon-claim-order.md](./layout-mon-claim-order.md)
- Product mon L/R naming also touched in layout rename / mon order work.

Likely suspects (for the implementing agent — do not treat as confirmed):

1. Monitor index vs physical L/R / connector order on X11 differs from prior Wayland session assumptions.
2. Profile mon0/mon1 mapping vs `forge tree` / workarea index.
3. Apply path moving windows to the wrong mon index when both mons have similar roles.

## Acceptance

1. Repro: clean dual-mon X11 session, `forge layout plan dev` + `forge layout dev`
   (or apply path used daily) → mon roles match profile (ghostty/tabs placement per mon).
2. Unit or synthetic fixture if the bug is pure planner/claim (mon index flip).
3. Live black X11: after apply, left mon and right mon match operator expectation
   for the `dev` profile (document which mon is left in the task note).
4. Do not regress within-mon `ensure_order` or two-pass claim.

## Out of scope

- Action pipeline AP1–AP5
- soft-rehome rename

## Session note

**2026-08-06 (TF-A): FIXED**

### Repro status

- **Live black X11 today:** mon roles **already correct** — not reverse.
  - Physical: DP-3 primary `+0+0` **LEFT**, HDMI-A-2 `+5120+0` **RIGHT**
  - Meta: **mon0 = left** (`geom:0,0,5120,2880#primary`), **mon1 = right**
  - `dev` bare dry-run: moved=0, only `ensure_order` mon1.s0 tab strip (Voice/Gmail)
- **Synthetic bug (confirmed):** when Meta mon0 is **RIGHT** (x=5120) and mon1 is
  **LEFT** (x=0), bare `dev` previously bound body[0]→mon0=right → cross-mon moves
  (L↔R role flip). Root cause of operator “reversed monitors” when Meta ≠ L→R.

### Fix

Bare dual arrays map **physical L→R** via `forest_mon_indices_left_to_right`
(rect / `geom:` stableKey), not Meta mon0..N. Explicit `monN` / `monitors[]` stay
Meta index. Builtin geometry roles `left`/`right`/`top`/`bottom` resolve by
geometry (profile `monitors` aliases still win). Save bare order uses same L→R.

### Live left mon identity (black X11 2026-08-06)

| Side | Meta | stableKey | connector (xrandr) |
| --- | --- | --- | --- |
| **LEFT** | mon0 / `mo0ws0` | `geom:0,0,5120,2880#primary` | DisplayPort-3 primary |
| RIGHT | mon1 / `mo1ws0` | `geom:5120,0,5120,2880` | HDMI-A-2 |

### Files

- `scripts/forge/layout_plan.py` — L→R bare bind, geom roles, forest helpers
- `scripts/forge/layout_save.py` — bare emit order L→R
- `scripts/forge/cli_help.py` — dual-mon sketch note
- `docs/user/layout.md`, `docs/DESIGN.md`
- `tests/unit/cli/test_layout_plan.py` — `TestBareMonGeometryOrder`

### Tests

- `pytest tests/unit/cli/test_layout_plan.py test_layout_save.py test_layout_apply.py` → **296 passed**
- `npm test` → **2252 passed**

### Next-agent

- Optional live apply after install/HUP if CLI not yet picking up this tree.
- No need to change black `dev.json` (bare L→R matches current Meta0=left).
- Within-mon `ensure_order` unchanged; mon1 tab order still thrashRisk when strip order drifts.
