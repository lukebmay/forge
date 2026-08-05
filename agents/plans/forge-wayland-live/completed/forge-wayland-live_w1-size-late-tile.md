# Task: forge-wayland-live_w1-size-late-tile

**Status:** ready for verify  
**Plan:** [forge-wayland-live.md](../plans/forge-wayland-live.md)  
**Branch:** `plan/forge-wayland-live`  
**Created:** 2026-08-04

## Problem

On Wayland (also unsafe on X11 if identity is late):

1. Windows map with **null/empty title** → `isFloatingExempt` → no
   `insertChildPercent` → sole sibling keeps `percent=1`.
2. Later title/class lands → `processFloats` tiles, but **share never carved**.
3. `computeSizes` uses absolute `percent` when >0 else `1/n` **without
   renormalizing** → sum >1 → remainder fold → **width 0 or negative**.
4. Only `notify::wm-class` re-evaluates; **no `notify::title`**.
5. Border actors may intercept pointer (Chrome tab clicks).

## Acceptance

1. **`computeSizes`:** mixed positive + zero percents renormalize so sizes are
   non-negative and sum to container size (within integer fold). Regression
   test: parent 2510px, children percent `[1, 0]` → both widths > 0 and sum
   exact.
2. **Late FLOAT→TILE:** `processFloats` (or helper) calls share carve when a
   window becomes tile and would otherwise sit at percent 0 beside positive
   siblings (use `insertChildPercent` / tree helper; do **not** break
   forge-3hsv dialogs — dialogs stay float-exempt and must not steal share).
3. **`notify::title`:** when title becomes non-empty/non-null, re-render path
   like wm-class (`renderTree("title-changed")` or equivalent); unit/regression
   test mirrors bug-482.
4. **Borders:** focus, selection, and split border actors set `reactive =
   false` (and track_hover false if applicable) when created.
5. **Tests green:** `npm test` relevant unit/regression; no X11-only assumptions.
6. **Do not** close Ghostty in live checks if any; keep comments short.

## Out of scope (later tasks)

- Layout CLI wait timeout / PlaceNext multi-chrome (W2)
- Guake monitor (W3)
- Full thrash matrix (W4)

## Session note

W1 AGREE after A/B. computeSizes renormalize, ensureTileShare, notify::title, borders non-reactive. 2069 tests pass. Live smoke pending install/reload.
