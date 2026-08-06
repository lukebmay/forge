# LX4 — Tab drag relocates a tile unit

**Status:** done  
**Priority:** P1  
**Plan:** [forge-layout-live-x11](../../forge-layout-live-x11.md)  
**Branch:** `plan/forge-layout-live-x11`  
**Created:** 2026-08-06  
**Taskforce:** A/B AGREE  

## Problem

Operator could not **drag a tab** to relocate its window/tile unit. Had to use
keybinds to move Nautilus out of a tab group. “Tab dragging should work to
relocate a tile unit.”

Today tab chrome only **activates** on primary click (`button-press` → focus);
no grab/drag gesture into the existing DnD / drop-zone path.

## Acceptance

1. Primary-button **drag** on a window tab (not close button) begins a grab
   equivalent to moving that tile unit (same as titlebar/grab-tile for that
   window).
2. Drop onto drop zones works: insert before/after, center → join tab/stack,
   peel out of group into adjacent split, including across containers.
3. Click without drag still only focuses/activates the tab (no accidental
   peel on short click).
4. Unit tests for drag threshold / operation build if pure; e2e optional.
5. Does not regress tab-click focus (LF2) or decoration teardown.

## Likely areas

- `tree.js` `_createWindowTab` / `_ensureConTab` button-press handlers
- `drag-drop.js` `DragDropManager` grab start / drop
- Window grab-tile entry points on WM

## Out of scope

- STACKED-only chrome polish; multi-row tab layout

## Session note

**2026-08-06 (Task Force B — AGREE):** Reviewed full uncommitted LX4 diff + re-ran
tab-drag / tab-click / tab-close / grab-fuzz / drag-drop suites (128 green; also
window/* + tab teardown 572 earlier). Acceptance holds: press arms only; ≥8px
starts grab; short click stays TILE; close-button path still isCloseControl +
own STOP (no arm); LF2 clickFn before arm; destroy cancels matching arm; drop
reuses grab-op-end zones.

B one-liners applied (not redesign):
1. `noteTabDragMotion` void `??` double-called `_handleMoving` — now single call.
2. `disable()` now `cancelTabDrag()` so stage `captured-event` cannot leak.
3. `begin_grab_op` success requires `ok === true` (undefined must not skip synthetic).

Residuals (non-blocking): CON tab = rep window only (matches titlebar unit path);
Mutter 49+ `begin_grab_op` sig still unshimmmed (throw → synthetic); no live/e2e
tab gesture; no unit for tree→arm wiring (API-level tests only).
