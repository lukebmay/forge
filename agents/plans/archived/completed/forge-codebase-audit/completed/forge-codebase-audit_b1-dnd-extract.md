# B1 — Extract DnD / grab cluster from window.js

**Plan:** [forge-codebase-audit.md](../../forge-codebase-audit.md)  
**Status:** Done  
**Priority:** Low (maintainability; wave 2)  
**Depends:** Wave 1 complete; Mode A residual closed  
**Task force:** A implement → B verify  

## Goal

Extract drag-drop / grab-tile cluster from `lib/extension/window.js` into a
dedicated manager module (same pattern as `SoftRehomeManager` /
`DecorationManager`): **behavior-preserving**, thin WM delegates, tests green.

## Why

`window.js` still ~4.4k lines (stretch &lt;3.5k, aspirational &lt;1k). DnD/grab is
the largest high-ROI extract remaining after wave 1; product risk is separate
from thrash recovery (good unit + regression coverage exists).

## Scope (in)

| Method / cluster | Notes |
| --- | --- |
| Grab lifecycle | `_handleGrabOpBegin`, `_handleGrabOpEnd`, `_grabCleanup` |
| Drag move / drop | `moveWindowToPointer`, `_handleMoving`, `_executeDropOperation`, `_buildDropOperation` |
| Preview | `_showDropPreview`, `_getDragDropCenterPreviewStyle` |
| Pointer target | `getDragPointer`, `findNodeWindowAtPointer`, `_findNodeWindowAtPointer` (if only used by DnD) |
| Misc | `swapWindowsUnderPointer`, `allowDragDropTile` |

Wire like soft-rehome: `this.dnd` / `this.dragDrop` manager; public WM methods
stay as thin wrappers so existing tests/spies keep working.

## Scope (out)

- Resize path (`_handleResizing`, keyboard resize) unless inseparable from grab
- Open-app / place-hint / dock sticky
- Behavior changes, DnD product tweaks, multi-line tabs (T9)
- Full rewrite of drop math

## Acceptance

- [x] New module under `lib/extension/` (e.g. `drag-drop.js` or `dnd.js`)
- [x] WM constructs manager; thin wrappers for public entry points
- [x] `window.js` line count drops by roughly the extracted cluster (~500–900+)
- [x] Unit: `tests/unit/window/WindowManager-drag-drop*.test.js` green
- [x] Regression: grab/drag bugs green (`bug-151`, `bug-62ja`, `bug-ue92`,
      `bug-xom3`, `bug-j9fo`, `bug-leqs`, `bug-te9o` as applicable)
- [x] Broader `npm test` green (or project unit-test target)
- [x] Plan session note + this task note; archive INDEX one-liner on Done
- [x] No product behavior change (extract + delegate only)

## Non-goals

- Deprecate STACKED / T9 multi-line
- Prefs / schema changes
- e2e Docker unless unit proves insufficient

## Session note

**B1 A (2026-07-27):** Behavior-preserving extract.

- New `lib/extension/drag-drop.js` (`DragDropManager`) — pattern matches
  `SoftRehomeManager` / `DecorationsManager`: live `_extWm`, cross-calls via WM
  wrappers for spies.
- `window.js`: `this.dragDrop = new DragDropManager(this._tree, this)`; all
  public/private DnD entry points are thin `...a` delegates.
- Shared grab state stays on WM: `grabOp`, `_draggedNodeWindow`,
  `_grabStartPointer`, `nodeWinAtPointer`, freeze/unfreeze.
- Out of extract (by design): `_handleResizing` / keyboard resize /
  `getPointerPositionInside` (also used by focus).

**Methods moved:** `swapWindowsUnderPointer`, `_executeDropOperation`,
`_showDropPreview`, `_buildDropOperation`, `_resolveDndCenterLayout`,
`moveWindowToPointer`, `getDragPointer`, `findNodeWindowAtPointer`,
`_findNodeWindowAtPointer`, `_handleGrabOpBegin`, `_handleGrabOpEnd`,
`_grabCleanup`, `allowDragDropTile`, `_handleMoving`,
`_getDragDropCenterPreviewStyle`.

**Line counts:** `window.js` 4487 → **3985** (−502); `drag-drop.js` **638**.

**Tests:** unit drag-drop 69/69; named regressions 13/13; `npm test` **185 /
1886** green.

**Risks for B:** circular import `drag-drop.js` → `window.js` for
`WINDOW_MODES`/`GRAB_TYPES` (same as `utils.js`/`tree.js`); resize still on WM
and still uses `_grabCleanup` via wrapper; signal binds still on WM methods.
