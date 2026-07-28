# T9 — Multi-line tabs (v1 wrap)

**Date:** 2026-07-27  
**Tags:** tiling, tabs, decoration  
**Task:** [forge-daily-driver_t9-multiline-tabs.md](../../plans/forge-daily-driver/completed/forge-daily-driver_t9-multiline-tabs.md)

## What

Optional wrap of TABBED tab chrome into multiple rows via `max-tabs-per-line`
(default **0** = unlimited single row, no behavior change).

## Why

North Star: many tabs stay usable without STACKED; `max=1` ≈ stack bar height
while layout stays TABBED.

## Design

- Pure: `planTabRows` / `tabbedBarHeight` in `tree-layout.js`
- max≥1: outer vertical decoration + per-row horizontal `St.BoxLayout` hosts
- Content rect uses total multi-row bar height
- STACKED enum unchanged this slice
