# Task: forge-layout-control-loop_cl8-deferred-hidden-open

**Status:** done  
**Plan:** [forge-layout-control-loop.md](../../forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05  
**Completed:** 2026-08-05

## Goal

During `LayoutBatch` (multi-open / `forge layout`), map new windows **hidden** and
**outside permanent tile geometry** so we do not carve temporary H/V slivers or
raise/focus-thrash. Early **PlaceNext monitor sticky**. Unhide when batch ends
(or on release API) so residual can apply once.

## Scope (CL8 only — extension + pure helpers + unit tests)

| In | Out |
| --- | --- |
| LayoutBatch deferred path in `trackWindow` / open commit | CLI parallel open (CL9) |
| PlaceNext → `move_to_monitor` like dock sticky | Apply chrome/scrim (CL10) |
| Hide actor (opacity 0); restore on release | Wayland live |
| No `insertChildPercent` / no open TILE commit while deferred | Soft-rehome rename |
| Suppress raise/activate for deferred maps | Full pre-skeleton CON builder |
| Pure helper module + vitest | |

## Design (locked)

1. When `openLayoutBatchActive` and window will tile:
   - Consume PlaceNext as today for `homeMonitor` / attach plan.
   - **`move_to_monitor(homeMonitor)`** when ≥ 0 (PlaceNext + dock already sticky).
   - Create tree node **FLOAT** under mon root (or attach target if already TABBED — OK);
     **do not** `insertChildPercent`; **do not** `_scheduleOpenCommit`.
   - Mark deferred (WeakMap / set on meta or node flag).
   - Hide compositor actor (`opacity = 0`); hide border if any.
   - Skip raise/activate paths for deferred while batch active.
2. Still track + bind signals so GetTree lists windowId for role pins.
3. `endOpenLayoutBatch` (depth → 0): **release all deferred** (unhide, clear flag).
   Residual CLI may TILE/move next; CL8 does not restructure tabs yet.
4. `disable()` / destroy: always release deferred (no stuck invisible windows).
5. N=1 open (no LayoutBatch): **unchanged** (still quiet → requestLayout).

## Acceptance

1. Unit tests cover pure deferred helpers (mark / release / should-defer). ✓
2. Existing layout-controller / open-commit / place-hint / W-storm tests green. ✓
3. `npm test` green for touched area; full suite preferred. ✓ (2113)
4. No mid-batch `insertChildPercent` for deferred opens (test or code path clear). ✓
5. PlaceNext mon sticky called for deferred PlaceNext plans (testable hook or unit). ✓
6. Session note on task; no push. ✓

## Session note

**2026-08-05 CL8 shipped (Task Force A)**

- New pure module: `lib/extension/layout-deferred-open.js` (store mark/take,
  shouldDefer, sticky mon predicate, hide/show actor helpers) +
  `tests/unit/extension/layout-deferred-open.test.js`.
- `window.js` `trackWindow`: when LayoutBatch + willTile → FLOAT, skip aspect
  split / `insertChildPercent` / `_scheduleOpenCommit`; PlaceNext/home mon
  `safeMoveToMonitor`; hide actor+border; latch need-commit.
- Release all deferred on `endOpenLayoutBatch` depth 0 and `disable()`; clear
  mark on `windowDestroy`.
- `processFloats` keeps deferred FLOAT; focus/raise/activate paths skip deferred.
- CL5 open-commit tests updated for deferred path; N=1 still open-commit.
- Full `npm test`: 2113 passed. Next: CL9 (parallel CLI open + wait-for-map +
  unhide gate before residual).
