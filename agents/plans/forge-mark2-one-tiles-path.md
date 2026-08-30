# forge-mark2-one-tiles-path — One TILES mutate surface

**Status:** completed — T1–T5 done
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-29
**Depends on:** firm-abstractions P6/P7 done
**Audit:** [forge-firm-abstractions/explore/08-tom-sole-source-audit.md](./forge-firm-abstractions/explore/08-tom-sole-source-audit.md)

## Goal

Every **TILES** user verb that today still calls `tree.split` /
`tree.group` / `tree.setLayout` / `moveIn` / `moveOut` / `swapSibling`
from `CommandHandler` goes through **kernel action ids → `runLiveForest`
/ OpSet** (same path as Move/Join/toggle/promote/size). Delete the twin
CommandHandler `tree.*` bodies in the same slices. Do **not** pare
`Node` / peel Meta (that is [forge-live-tom-cutover](./forge-live-tom-cutover.md)).

## Acceptance

- [x] Leftover TILES CommandHandler handlers listed below either call
      `runLiveForest` / OpSet **or** are explicitly renamed as non-TILES
      Host SurfaceOps (float/snap/resize stay Host).
- [x] No CommandHandler path for Split / merge-group / stacked-tab
      toggle / moveIn / moveOut still mutates via `tree.split` /
      `tree.group` / `tree.setLayout` as the primary body.
- [x] Vitest CommandHandler + proto `npm test` green.
- [x] Glossary stays [`mark2.md`](../../prototypes/container-motion/src/opsets/mark2.md)
      — no second verb table.

## Implementation slices

| Slice | What | Status |
| --- | --- | --- |
| **T1** | Inventory leftover handlers → target action id (or Host-only label) | done |
| **T2** | Wire Split / LayoutStackedToggle / LayoutTabbedToggle / WindowMergeGroup onto OpSet (`toggleSplit` / `toggleTabStack` / join-or-group as Mark 2 already defines) | done |
| **T3** | Wire WindowMoveIn/Out + SwapNext/Prev / WindowSwapLastActive onto OpSet or delete if redundant with Move/Join | done |
| **T4** | Retarget unit tests off `tree.move` / direct `tree.split` where they claimed product TILES | done |
| **T5** | Delete dead CommandHandler twin bodies; note remaining `tree.*` callers (DnD/RunSteps/open) for sibling plans | done |

## Out of scope

- DnD / RunSteps / DBus dest-reparent → [forge-dnd-mark2-complete](./archived/completed/forge-dnd-mark2-complete.md)
- Nest invoke helper → [forge-nest-mark2-invoke](./forge-nest-mark2-invoke.md)
- Live Forest cutover / durable CON ids → [forge-live-tom-cutover](./forge-live-tom-cutover.md)
- Apply → TOM (P5c parked)

## Context for the next agent

- This plan is **done**. CommandHandler TILES verbs go through
  `runMark2` / `runLiveForest` (T1–T5). No twin `tree.split` /
  `group` / `setLayout` / `moveIn` / `moveOut` / `swapSibling` bodies
  remain in `command.js`.
- **Host SurfaceOp (left on purpose):** `WindowSwapLastActive` still
  `tree.swapPairs` (Meta TabList last-active; not Mark 2 Move/Join).
  Focus/Float/snap/resize stay Host.
- Remaining `tree.*` production callers are **out of scope** here —
  inventory in Session note T5. Owners:
  [forge-dnd-mark2-complete](./archived/completed/forge-dnd-mark2-complete.md) (D1–D4 done),
  RunSteps/session-api, open/`window.js`, live cutover (do not pare
  Node).
- Do not merge monitor-resolves. Do not retarget Apply onto T6.
- Brake: `cd prototypes/container-motion && npm test` (154+).
- Evidence: T1 table below; explore/08 § Dual writers is stale on
  CommandHandler leftovers (T2/T3 wired those).

## Session note

**T5 done** (2026-08-29). Confirmed no dead CommandHandler twin
bodies. Remaining `tree.*` callers documented for sibling plans.
Acceptance met → plan **completed**. No product rewrite (DnD / Node
untouched). CommandHandler vitest **78** green.

### Twins (gone)

`lib/extension/command.js` has **no** `tree.split` / `group` /
`setLayout` / `moveIn` / `moveOut` / `swapSibling` / `tree.move`.
TILES verbs: Split/`LayoutToggle` → OpSet `toggleSplit`; stacked/tab
toggles → `toggleTabStack`; `WindowMergeGroup` / `WindowMoveIn` →
`runMark2` join; `WindowMoveOut` / `SwapNext`/`SwapPrev` → `runMark2`
move. Only leftover CommandHandler `tree.*`: Host
`WindowSwapLastActive` → `wm.tree.swapPairs` (`command.js` ~574).

Dispatch-guard tests already assert: Split no `tree.split`; merge no
`tree.group`; MoveIn/Out no `tree.moveIn`/`moveOut`; SwapNext/Prev no
`tree.swapSibling`; `move.left` no `tree.move`.

### Remaining production `tree.*` (sibling owners)

Not CommandHandler twins. Do **not** rewrite here. `tree.js` still
**implements** these helpers (internal `split` / `setLayout` /
`swapPairs` / `swapSibling`→`swapPairs` / `slotSplitUnit`→`split`);
do not pare Node.

| File | Site | Call | Owner |
| --- | --- | --- | --- |
| `drag-drop.js` | `swapWindowsUnderPointer` ~886 | `swapPairs` | DnD. Method has **no other callers** (WM façade only). |
| `drag-drop.js` | `_commitDropSurface` ~926 | `swapPairs` | DnD SurfaceOp `swapPairs` (D4 done; `_executeDropOperation` gone) |
| `drag-drop.js` | `_commitDropSurface` ~968 | `split` (slotSplit fallback after `slotSplitUnit`) | DnD SurfaceOp `slotSplit` |
| `drag-drop.js` | `_commitDropSurface` ~980 | `split` | DnD SurfaceOp `split` (detach) |
| `drag-drop.js` | `_commitDropMark2` ~1546 | `setLayout` STACKED→TABBED when stacked disabled | DnD mapped Join coerce |
| `drag-drop.js` | `_commitEmptyMonitorDrop` ~1894 | **comment only** (`tree.move` mon path) | empty-mon; no `tree.move` call |
| `session-api.js` | `_setLayoutStructureOp` ~1661 / 1703 | `split` wrap then `setLayout` | ApplyLayout structure RunSteps |
| `session-api.js` | `_layoutOp` ~3598 / 3643 | `split` wrap then `setLayout` | RunSteps `layout` |
| `session-api.js` | `_layoutCycleOp` ~3738 | `setLayout` | RunSteps `layout-cycle` |
| `session-api.js` | `_mergeGroupOp` ~3829 | `group` | RunSteps `merge-group` / `group` |
| `session-api.js` | `_moveInOp` ~4011 | `moveIn` | RunSteps `move-in` (C4 layout-unit) |
| `session-api.js` | `_moveOutOp` ~4062 | `moveOut` | RunSteps `move-out` (C4 layout-unit) |
| `session-api.js` | `_swapOp` ~2774 | `swapPairs` | RunSteps `swap` (dest pair, not SwapNext) |
| `session-api.js` | `_moveOp` | `insertBefore` / `appendChild` | dest-reparent; **not** `tree.move` |
| `window.js` | `_handleLayoutModeToggle` ~1645–1663 | `setLayout` | Host tabbed/stacked **mode** toggle |
| `window.js` | `applyDefaultLayoutToContainer` ~1701 / 1706 | `setLayout` | **dead leftover** (no production caller; CommandHandler mock only). Old Split post-`tree.split`. |
| `window.js` | `_rehomeOverflowToTab` ~4747 | `group` | open overflow → tab |
| `window.js` | `_ensureTabbedForOpen` ~4842 | `split` force | open-min tab wrap |
| `window.js` | `_maybeAspectSplitForOpen` ~4893 / 4904 | `split` | auto-split / tiny-pane-tab on open |

### Dead as product TILES (helpers still exist)

- `tree.move` — **no** production caller in `lib/` (tests + DnD comment).
- `tree.swap` — tests only (`Tree-operations`).
- `tree.swapSibling` — tests only; SwapNext/Prev are Mark 2 wrap-rotate.

### Tests still on Host/helper `tree.*`

- `Tree-operations`, `set-layout-i1`, `ungroup-i2`,
  `move-focus-parent-c4` (RunSteps `moveIn`/`moveOut`)
- `bug-qxqb`, `bug-e3k1`, `bug-s7ri`, `forge-lx2`, `forge-lx3`
  (`tree.move` helper)
- Overflow rehome `tree.split` fixture; DnD `spyOn(tree.split)`
- Stale e2e prose: `test_stacked_tabbed.py` still says command.js
  `tree.split`; `test_window_swap.py` still says `tree.move` — do not
  retarget here.

### T4 (prior)

Product TILES tests use `command()` / forest. Host/helper suites
labeled. Full repo **3589**; proto **154**; CommandHandler **78**.

### Next

Not this plan. DnD D1–D4 **done**. RunSteps `move-in`/`move-out`
still C4 `tree.moveIn`/`moveOut`. Open `window.js` split/group stays
until cutover / a dedicated open slice. Do not pare Node.

### T1 inventory (CommandHandler)

| Handler | Target |
| --- | --- |
| `move.*` / `Move` | `runMark2` `move` |
| `join.*` / `Swap` | `runMark2` `join` |
| `toggleSplit` / `LayoutToggle` / `Split` | OpSet `toggleSplit` (T2) |
| `toggleTabStack` / `LayoutStackTabToggle` / `LayoutStackedToggle` / `LayoutTabbedToggle` | OpSet `toggleTabStack` (T2) |
| `promote` / `WindowUngroup` / `promoteRecursive` | OpSet |
| `layout.cycle±` | `api.cycleLayout` |
| `size.*` | TomApi via `runLiveForest` |
| `WindowMergeGroup` | `runMark2` `join` toward last-active tiled sibling else first (T2) |
| **`WindowMoveIn`** | `runMark2` `join` toward **adjacent sibling CON** (T3) |
| **`WindowMoveOut`** | `runMark2` `move` **cross-axis** of parent (T3; Mark 2 breakout) |
| **`SwapNext` / `SwapPrev`** | `runMark2` `move` in-axis next/prev (T3; wrap-rotate at edge) |
| **`WindowSwapLastActive`** | **Host SurfaceOp** — `tree.swapPairs` + Meta `get_tab_next` (T3; not Move/Join) |
| `focus.*` / `Focus` / `FocusNext` / `FocusPrev` | **Host-only** (`tree.focus*`) |
| `Float*` / `SnapLayoutMove` / resize / zoom / prefs / gaps / tiling-mode / workspace-skip / showtab / pointer | **Host-only** |
| kernel `launch` / `remove` | **no CommandHandler handler** |

### T3 wiring

- `WindowMoveIn` — adjacent CON only (next then prev). Join enter if
  that CON is in-axis; Join flatten if cross-axis. Non-adjacent CON
  (WINDOW in between) no-ops at Join (would wrap the WINDOW). Enter
  edge is Mark 2 (arrive from right → prepend), not old `appendChild`.
- `WindowMoveOut` — cross-axis Move (VSPLIT → right; else down) so
  Mark 2 breakouts instead of in-axis swap. Acts on the **WINDOW
  leaf**, not C4 layout-unit (tab bag no longer peels as a whole).
  Parent MONITOR → no-op. Sole CON on MONITOR → breakout refused
  (max-1), not old peel onto MONITOR.
- `SwapNext` / `SwapPrev` — in-axis Move (VSPLIT down/up; else
  right/left). Edge is Mark 2 wrap-rotate (`H(A,B,C)` last→ =
  `H(C,A,B)`), not pairwise `swapPairs` with the wrap target. Sibling
  CON swaps as a unit, not an inner leaf. Default gsettings chords
  stay empty; names stay PascalCase (dir is Host-picked).
- `WindowSwapLastActive` left as Host SurfaceOp. Last-active can be
  any window (not in-axis sibling). Forcing Move/Join would be a bad
  fit. `tree.swapPairs` stays for this + DnD.

### Risks (T3, still true)

- `WindowMoveIn` of `H(A,V(B,C))` now **flattens** (Join cross-axis
  CON), not enter-V. Adjacent TAB still enters.
- `WindowMoveOut` of a tab member **peels the leaf**, not the bag.
- `SwapNext` at edge **rotates**, not pairwise-swaps with first.
- RunSteps `move-in`/`move-out` still `tree.moveIn`/`moveOut` (C4
  layout-unit) — leftover for RunSteps / nest, not CommandHandler.
