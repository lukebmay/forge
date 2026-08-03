# Selection S1 — ops target + bag chrome

**Date:** 2026-08-03  
**Plan:** forge-container-selection  
**Task:** [completed](../../plans/forge-container-selection/completed/forge-container-selection_s1-state-chrome.md)  
**Commit:** `f61e69d` on `plan/forge-first-class-containers`

## What / why

Container spine exists, but “selected CON” was half-real (attachNode + focus-parent)
without durable rules or a visual distinct from focus. Users need: focus = where you
type; selection = what tiling ops move.

## Design

- Sticky unit selection; no mode-first v1  
- Meta focus to another window resets; same-window re-focus keeps elevated CON  
- Separate CSS class `.window-selection-border` (lime); focus purple/red unchanged  
- Clear command + schema key unbound (chords S3)

## Residual

S2 elevated move/swap/layout; S3 Vim Super+p + BackSpace clear family; live QA S5.
