# forge-dnd-mark2-complete — DnD + synthetic drop → Mark 2

**Status:** **complete** (D1–D4) — 2026-08-29
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-29
**Depends on:** firm-abstractions P6 mapped Join/Move;
[forge-mark2-one-tiles-path](../../forge-mark2-one-tiles-path.md) **T1–T5
done** (CommandHandler twins gone; leftover DnD `tree.split` /
`swapPairs` / `setLayout` listed there). Different files:
`drag-drop.js` / `drop-intent.js` / `session-api.js`
**Audit:** [forge-firm-abstractions/explore/08-tom-sole-source-audit.md](../../forge-firm-abstractions/explore/08-tom-sole-source-audit.md)

## Goal

Pointer DnD commit and **synthetic** DnD (RunSteps `dnd-drop`, e2e
`fuzzDrag`) share **one** mutate path: `resolveDropMark2` → Mark 2 /
`runLiveForest` when mapped; remaining cases become Mark 2 ops or
**named** SurfaceOps — `_executeDropOperation` discarded as a mutator
(import-map intent).

## Acceptance

- [x] RunSteps `_dndDropOp` / session-api drop calls the same resolve →
      runner path as pointer commit (no execute-only twin).
- [x] Swap / merge-group / wrap / detach / invent / empty-mon either map
      to Mark 2 **or** are documented SurfaceOps with one body.
- [x] Unit: drop-intent + WindowManager-drag-drop green; add regression
      that synthetic drop hits `resolveDropMark2` when Join/Move map.
- [x] e2e `fuzzDrag` / nest synthetic drop share `_commitResolvedDrop`
      (empty-mon still `_commitEmptyMonitorDrop`).
- [x] Gesture/preview may stay in `drag-drop.js` (not a second mutator).
- [x] `_executeDropOperation` removed (no mutator, no alias). Callers
      use `_commitResolvedDrop` / `_commitDropSurface` /
      `_commitEmptyMonitorDrop`.

## Implementation slices

| Slice | What | Status |
| --- | --- | --- |
| **D1** | Fix RunSteps/session-api `dnd-drop` to call `resolveDropMark2` + mapped runner (stop direct `_executeDropOperation`) | **done** |
| **D2** | Map or name remaining execute ops (swap / merge-group / wrap / invent / empty-mon / detach) | **done** |
| **D3** | Retarget e2e fuzzDrag / nest synthetic drop onto the shared path | **done** |
| **D4** | Delete or shrink `_executeDropOperation` to non-mutating helpers only | **done** |

## Out of scope

- Tab-chrome DnD (D046) unless it already shares resolve
- Full live TOM cutover
- Nest CLI invoke helper (sibling plan); N4 DnD-as-action still optional

## Context for the next agent

- Pointer + synthetic mutate: `DragDropManager._commitResolvedDrop` →
  `resolveDropMark2` → `_commitDropMark2`; else `resolveDropSurface` →
  `_commitDropSurface`. `_executeDropOperation` is gone (D4; no alias).
  `_dndDropOp` uses `_commitResolvedDrop`. Empty-mon still
  `_dndEmptyMonDropOp` → `_commitEmptyMonitorDrop` (pointer
  `!nodeWinAtPointer` same body). `_commitResolvedDrop` emptyMonitor
  SurfaceOp passes `ctx.destMonitor` into that commit.
- e2e `fuzzDrag` prefers `sessionApi._dndDropOp` (named zone); fallback
  grab + `moveWindowToPointer`. Nest:
  `forge-test nested dnd-drop TILE [ONTO] [--zone] [--dest-monitor N]`
  (Shell.Eval → `_dndDropOp`; not CommandHandler / not a Mark 2 id).
  `fuzzDragPath` still walks the grab loop; grab-end uses pointer
  `_commitResolvedDrop`.
- Synthetic ctx must include `focusNodeWindow` so same-parent edge is
  reorder (Move) not wrap.
- Mark 2 maps: CENTER-into-group Join (adjacent sibling CON, not
  MONITOR parent); same-parent in-axis adjacent Move; **adjacent H/V
  CON SWAP → Move**.
- Host SurfaceOps (catalog names, one body `_commitDropSurface`):
  `swapPairs` (MONITOR/TAB/non-adjacent SWAP), `group`
  (`mergeWindowsIntoGroup` — CENTER H/V siblings; Join would wrap-split),
  `slotSplit` (`slotSplitUnit`/`split`), `split` (detach), `wrap`
  (edge/MONITOR invent CON on **dest**), `insert` (`insertBefore`).
  Empty-mon: `_commitEmptyMonitorDrop` (not a new Mark 2 op — pointer
  dest is not Move neighbor-edge).
- Do **not** map MONITOR-parent Join/Move/SWAP: `wrapMonitorMax1` would
  wrap every live mon child. Do **not** map CENTER merge-group to Join
  (TAB vs opposite-split). New Mark 2 op = design lock; none added.
- Regression: `tests/unit/window/WindowManager-drag-drop.test.js`
  `synthetic dnd-drop — Mark 2 mapped` (Join + Move + SWAP-as-Move) and
  CENTER HSPLIT `group` SurfaceOp. Mapped paths spy `_commitDropSurface`
  not called. Nest JS builder: `tests/unit/cli/test_nest_invoke.py`
  (`_dndDropOp`, destMonitor).
- Words: [`mark2.md`](../../../../prototypes/container-motion/src/opsets/mark2.md).

## Session note

D4 done. Deleted `_executeDropOperation` (drag-drop + WM façade); no
production callers. Pointer + synthetic still `_commitResolvedDrop`.
Empty-mon still `_commitEmptyMonitorDrop`. Tests spy
`_commitDropSurface` instead of execute. N4 nest DnD-as-action left
optional. No CommandHandler / command.js. No nest live. No commit.
