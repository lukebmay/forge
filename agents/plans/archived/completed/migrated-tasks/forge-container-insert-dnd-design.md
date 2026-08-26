# forge-container-insert-dnd-design — insert + Chrome-like DnD lock

**Status:** locked (operator pick A + drag table)
**Plan:** [forge-container-motion-design](../plans/forge-container-motion-design.md)
  · [forge-tab-chrome-drag](../plans/forge-tab-chrome-drag.md)
  · [forge-first-class-containers](../plans/forge-first-class-containers.md)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

Lock **how new windows attach** and **how mouse drag reorders /
reparents** before more Shell motion patches.

## Lock (2026-08-13)

- **Insert: A — slot-split.** D032.
- **Drag table: confirmed** (see below).
- Implement: [insert A](./forge-container-insert-a.md). TD1 strip
  reorder after insert lands.

### Insert A

Always 50/50-split the **focused unit’s slot** (new CON `[focused, new]`
if the H/V parent already has siblings). Never a 3rd even sibling of an
existing H/V CON. Even 3-way only after explicit user resize of those
siblings, or `window-reset-sizes`.

Focused unit: TABBED/STACKED **bag** if the leaf is inside one; else
the leaf. Do **not** same-app tab-join (that was C).

2nd window on empty monitor: sibling of the first (no extra wrap).
`auto-split-enabled` stays optional quarter-tiling (1-child orientation
toggle). Do not flip its default.

### Drag (locked)

| Gesture | Result |
| --- | --- |
| Drag along tab strip / along H/V sibling row | **Reorder** in that parent; percents travel with nodes |
| Drag a tab out onto a tile CENTER | **Join** that group (`mergeWindowsIntoGroup`) |
| Drag a tab/window onto a tile edge | **Slot-split that target** (same as A) — do **not** append as even 3rd sibling of target’s parent |
| Drag onto empty monitor | Leaf-only (R022) |
| Peel from tab bag with no drop target | Model B wrap-in-slot |

## Acceptance (after pick)

- [x] Operator picks A / B / C (or a redesign)
- [x] Drag table confirmed or edited
- [x] Then spawn implement tasks (insert policy + TD1 reorder)

## Session note

**2026-08-13:** Operator picked **A** and confirmed the drag table.
D032. Implement insert + same-axis edge wrap first; TD1 later.
