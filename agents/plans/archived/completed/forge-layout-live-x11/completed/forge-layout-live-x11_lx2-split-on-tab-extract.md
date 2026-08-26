# LX2 — Split orientation when leaving a tab group

**Status:** done  
**Priority:** P1  
**Plan:** [forge-layout-live-x11](../../forge-layout-live-x11.md)  
**Branch:** `plan/forge-layout-live-x11`  
**Created:** 2026-08-06  
**Taskforce:** A/B AGREE  


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

**2026-08-06 B:** **AGREE.** Diff is minimal and correctly gated: capture
`wasTabOrStack` + `groupRect` before epilogue; `peeledToPair` requires group
still under `parentTarget`, exactly 2 children, group included — avoids
multi-sibling, wrong-parent, and swap false positives (swap returns before
`_finishMove`). Reorient after `resetSiblingPercent` + `resetLayoutSingleChild`
— no axis/percent fight; single-child TABBED→HSPLIT (qxqb) still runs first.
MONITOR vs nested CON: only reorients when group’s parent is the target (solo
peel under mon); nested outer CON not reoriented — acceptable for stated path.
DnD left alone (own zones). Tests green: LX2 (5), qxqb, 213, s7ri, e3k1,
Tree-operations, Tree-layout (108 total in batch).

**2026-08-06 A:** Root cause — peel reparents next to tab CON but never reorients
parent. Fix in `Tree._finishMove` via `determineSplitLayoutForRect(groupRect)`.
