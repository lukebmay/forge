# B1 — DnD / grab extract from window.js

**Date:** 2026-07-27  
**Tags:** audit, extract, dnd, window.js  
**Plan:** [forge-codebase-audit](../../plans/forge-codebase-audit.md)  
**Task:** [completed](../../plans/forge-codebase-audit/completed/forge-codebase-audit_b1-dnd-extract.md)

## What

Moved grab-tile / drag-drop methods from `WindowManager` into
`lib/extension/drag-drop.js` (`DragDropManager`), same pattern as
`SoftRehomeManager` / `DecorationsManager`.

## Why

Post–wave-1 `window.js` was still ~4.4k. DnD/grab was the largest clean
cluster left with strong unit + regression coverage.

## Design

- Manager holds logic; WM keeps public method names as thin wrappers (spies/tests).
- Live state on WM: `grabOp`, `_draggedNodeWindow`, `_grabStartPointer`,
  `nodeWinAtPointer`, freeze/unfreeze render.
- Cross-calls go through `this._extWm` so tests that spy on WM still intercept.
- Resize (`_handleResizing` and friends) stayed on WM — out of B1 scope.

## Numbers

| File | Before | After |
| --- | ---: | ---: |
| `window.js` | 4487 | 3985 (−502) |
| `drag-drop.js` | — | 638 |

`npm test`: 185 files / 1886 tests green.
