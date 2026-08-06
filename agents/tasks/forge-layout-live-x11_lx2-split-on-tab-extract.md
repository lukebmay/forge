# LX2 — Split orientation when leaving a tab group

**Status:** ready  
**Priority:** P1  
**Plan:** [forge-layout-live-x11](../plans/forge-layout-live-x11.md)  
**Branch:** `plan/forge-layout-live-x11`  
**Created:** 2026-08-06  

## Problem

When a window is moved **out** of a TABBED (or STACKED) group with keybinds
(pop-out / peel), the result was **two thin vertical slivers**.

Desired: choose HSPLIT vs VSPLIT from the **largest dimension of the tab group
rect** so each resulting pane is as close to square as possible (avoid long
thin vertical *or* horizontal slivers).

Example: tab group ~2510×2864 (taller than wide) → prefer **VSPLIT** (stacked
bands) over HSPLIT (two skinny columns).

## Acceptance

1. Extracting one window from a multi-member TABBED group leaves:
   - remaining members still TABBED (if ≥2) or collapsed per existing rules;
   - the **parent split** of `[group | extracted]` (or equivalent structure)
     uses orientation from `determineSplitLayoutForRect(tabGroupRect)`:
     - `width < height` → VSPLIT  
     - else → HSPLIT  
2. Equal (or existing) percent share; no postage-stamp panes solely from wrong
   axis.
3. Unit test(s) with portrait vs landscape tab-group rects.
4. Applies to keybind move peel path (and DnD peel if shared); do not break
   same-parent sibling swaps inside a tab bag.

## Likely areas

- `Tree.move` / `_finishMove` / reparent out of TABBED
- `WindowManager.determineSplitLayoutForRect` (already exists; used by
  auto-reorient-on-close / auto-exit-tabbed)
- `command.js` Move path after peel

## Out of scope

- Tab drag UI (LX4); cross-mon (LX3)

## Session note

**2026-08-06:** Filed from operator: Nautilus keybind pop-out → thin verticals.
