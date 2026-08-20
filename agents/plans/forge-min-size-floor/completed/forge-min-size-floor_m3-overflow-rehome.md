# forge-min-size-floor_m3 — Mid-session oversized BFS + remove gap + float

**Status:** done
**Plan:** [forge-min-size-floor](../forge-min-size-floor.md)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-19
**Model:** 4.6 high

## Goal
Mid-session oversized BFS + remove gap + float per plan locks L1–L8 / D049.

## Acceptance
- [x] Matches plan slice M3
- [x] Session note when done

## Context for the next agent
M3 landed. Do not start M4 docs or M5 from this note unless assigned.
Do not reintroduce shrink-probe. Do not rewrite HANDOFF/PRIORITY.

## Session note

**2026-08-19 M3 done.** No commit/push. No M4/M5.

### APIs
- Pure (`open-min-place.js`): `slotOverflowsMins(slot, mins, eps=4)` —
  min > slot+ε on an axis. `resolveTileOverflowPlacement` — tab-only sibling
  of `resolveOpenMinPlacement`; excludes `selfUnit` / containers that already
  contain it; never split.
- WM: `wm.rehomeIfSlotTooSmall(node)` — learn (`noteWindowMinFromClamp`) then
  same-mon BFS tab (`_ensureTabbedForOpen` + `insertWindowIntoGroup` / `group`)
  else `addFloatOverride` + peel to MONITOR. Vacated gap:
  `_collapseVacatedOverflowSlot` (1-child H/V hoist, percent inherit,
  `resetLayoutSingleChild` / `redistributeSiblingPercent` / `cleanTree`;
  Node child APIs only).
- Debounce: SourceBag `overflowRehome:<id>` (after min-clamp delay).
- Contracts: new mid-session row; D026 row says overflow **instead of** restore.

### D026 one owner
- Detect uses **mins**, not raw frame. Max/fs/zoom/GRAB stay D026.
- `updateMetaPositionSize`: `_slotTooSmallForTile` → schedule rehome,
  **not** `_restoreTileToSlot`.
- `_restoreTileToSlot` itself refuses illegal slots and schedules rehome.
- Skip `isApplyEpochLive()` (L6). Learn-after-move hooks
  `_scheduleMinClampLearn` so forge-caused echo still rehomes after clamp.

### L0
```
npm test -- tests/unit/extension/open-min-place.test.js \
  tests/unit/shared/min-tile-size.test.js \
  tests/unit/extension/drop-intent.test.js \
  tests/unit/window/WindowManager-open-app-policy.test.js \
  tests/unit/window/WindowManager-drag-drop.test.js \
  tests/unit/window/WindowManager-overflow-rehome.test.js
→ 135 passed
```
Also layout-sensors + layout-apply-epoch **27** green.
`rg` probe symbols under `lib/` empty. Nest not run.

### Leftover for M4/M5
- Contracts DnD mins row still mentions probe (M4 rewrite).
- DESIGN / troubleshooting / HANDOFF still pre-M3 (orchestrator + M4).
- Host prove: tiny env + Nautilus overflow BFS/float (M5).
- Passive learn → `window-mins.json` still whole-plan checkbox (not M3).
