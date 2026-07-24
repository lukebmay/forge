# T4 — Sizing policy (equal until user resize)

**Date:** 2026-07-24  
**Plan:** forge-daily-driver  
**Task:** [completed](../../plans/forge-daily-driver/completed/forge-daily-driver_t4-sizing-policy.md)

## What / why

Users expected “equal tiles until I resize,” but non-zero percents from normalize
or min-size layout looked like custom sizes, so new windows preserved accidental
ratios. Product lock was policy on current percents, not a flex engine.

## Design

- **`Node.userSized`** — true only after mouse resize, keyboard expand/shrink,
  or golden ratio. Automatic percent writes leave it false.
- **`insertChildPercent`** — if no sibling is user-sized → equalize (percent 0).
  If any is, honor **`new-window-size-policy`**: `preserve` (forge-7m3 carve) or
  `equalize`.
- **Min-size** — after redistrib, write effective percents so stored ratios match
  painted frames; still not user intent.
- **Super+=** — existing `window-reset-sizes` clears percent + `userSized`.

## Residual

Live install trial on black: third-window equal vs preserve after resize; prefs
toggle; overlay `~%` vs `%`. Nested `split()` now copies `userSized`.
