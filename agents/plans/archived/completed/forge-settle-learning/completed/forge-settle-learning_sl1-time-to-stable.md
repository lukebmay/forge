# Task: forge-settle-learning_sl1-time-to-stable

**Status:** done  
**Priority:** mid  
**Plan:** [forge-settle-learning.md](../../forge-settle-learning.md)  
**Branch:** `plan/forge-settle-learning`  
**Created:** 2026-08-06  
**Completed:** 2026-08-06  

## Goal

Time-to-stable observation + raise-only learned `minQuietMs` for open quiet path.

## Acceptance

All met (A/B AGREE after forest-ok gate fix).

## Session note

**2026-08-06:** Shipped + verified.

### Shipped
- `computeLearnedMinQuietMs` / `recordSettleSample` / `snapshot()` in `app-thrash-catalog.js`
- Pad 1.2, cap 2000, EMA 0.3 stats; Ghostty seed floor kept
- LC `noteOpenPendingForSettle` + `_observeSettlePending` (sample only when pending id in per-window results ok; forest-ok only if no usable results)
- Open schedule notes pending; destroy clears; open fire does **not** clear early
- Unit: 114 tests (catalog + open + controller + open-commit)

### Next
- SL2: layout-batch deferred opens sample + debug dump for operator data
