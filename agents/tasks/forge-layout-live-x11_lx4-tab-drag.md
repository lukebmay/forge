# LX4 — Tab drag relocates a tile unit

**Status:** ready  
**Priority:** P1  
**Plan:** [forge-layout-live-x11](../plans/forge-layout-live-x11.md)  
**Branch:** `plan/forge-layout-live-x11`  
**Created:** 2026-08-06  

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

**2026-08-06:** Filed from operator: drag does not relocate; keybinds only.
