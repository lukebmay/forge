# TZ-mode-a-nested — Mode A under role VSPLIT

**Date:** 2026-07-27  
**Plan:** [forge-workon-thrash-zero](../../plans/forge-workon-thrash-zero.md)  
**Task:** [completed](../../plans/forge-workon-thrash-zero/completed/forge-workon-thrash-zero_tz-mode-a-nested.md)

## What

Live `workon dev` after stacking Nautilus under left Ghostty and FB/Chess under
right Ghostty took **Mode B park** (chrome bag) instead of **Mode A term tabs**.

## Why

`detect_thrash` scored any nested H/V under a role mon-child as thrash. That
matches broken multi-role tab structure, but also normal companion stacking
under a single-role term view. False thrash forced Mode B.

## Fix

1. Nested-split thrash only for **multi-role tabbed** profile views.
2. Collect via **mon-child containment** so nested CON companions join the
   role-owned view (not only CON siblings / rect overlap).

True thrash (wrong mon, excess mon kids, broken multi-role tabs) still Mode B.
