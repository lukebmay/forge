# OP-opt — tiny-pane → tab fallback

**Date:** 2026-07-26  
**Tags:** tiling, open-app, tabs  
**Task:** [forge-daily-driver_op-opt-tiny-pane-tab.md](../../plans/forge-daily-driver/completed/forge-daily-driver_op-opt-tiny-pane-tab.md)

## What

On open-app aspect split, if either half of the LFT rect would be below a
min-edge threshold, create a TABBED group instead of a postage-stamp H/V
split. **Default off.**

## Why

OP1 always 50/50-split LFT by aspect; nested/narrow tiles became unusable.

## Design

- Threshold = max(min-edge gsetting default 320, ⌊12% workarea min edge⌋, app min)
- Both width and height of proposed children checked (not area fraction)
- Wire only `_maybeAspectSplitForOpen`; manual splits unchanged
