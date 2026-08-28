# forge-min-size-floor_m2 — Delete shrink-probe product code

**Status:** done
**Plan:** [forge-min-size-floor](../forge-min-size-floor.md)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-19
**Model:** 4.5

## Goal
Delete shrink-probe product code per plan locks L1–L8 / D049.

## Acceptance
- [x] Matches plan slice M2
- [x] Session note when done

## Context for the next agent
See plan `M2` section. Serial: M1→M2 before M3 (shared window.js). Do not reintroduce shrink-probe.

## Session note

**2026-08-19 M2 done** (same agent as M1).

### Deleted
- `window.js`: `ensureWindowMinSizeKnown`, `_queueMinSizeProbe`,
  `_flushMinSizeProbeQueue`, `_cancelMinSizeProbes`, `_abortMinSizeProbe`,
  `_minSizeProbeQueue` / `_minSizeProbeActive`, all `_forgeMinProb*` flags,
  `move()` early-return on probing
- `drag-drop.js`: grab-begin cancel + grab-end queue/clear
- `noteWindowMinFromClamp`: `_forgeMinProbing` early-return removed

### Kept
- `readWindowMinSize` (env floor) · `noteWindowMinFromClamp` /
  `_scheduleMinClampLearn` · class `window-mins.json` · DnD red zones ·
  open-min BFS/float

### L0
```
npm test -- tests/unit/shared/min-tile-size.test.js \
  tests/unit/extension/drop-intent.test.js \
  tests/unit/extension/open-min-place.test.js \
  tests/unit/window/WindowManager-open-app-policy.test.js \
  tests/unit/window/WindowManager-drag-drop.test.js
→ 120 passed
```
`rg` probe symbols under `lib/` empty. Nest not required (dead-code delete).

### Next
M3 overflow rehome + gap (**4.6 high**). M4 docs still mention probe in contracts.
