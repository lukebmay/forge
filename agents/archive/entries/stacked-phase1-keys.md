# STACKED Phase 1 — keys, kits, merge / stack↔tab

**Date:** 2026-07-28  
**Plan:** forge-stacked-layouts  
**Task:** [completed](../../plans/forge-stacked-layouts/completed/forge-stacked-layouts_phase1-keys.md)

## What / why

Users want stack mode available without making stacks the ambient group type.
Keyboard needs a lossless tab↔stack chrome flip, a merge into tabbed, portable
kits under shellrc, and CLI/RunSteps parity.

## Design

- **Mode on by default;** **tabbed** stays default group (DnD, bare sugar, merge).
- **Group chrome cycle** only on existing TABBED/STACKED (no-op on H/V).
- **Merge** focus + last-active (sibling fallback) → tabbed via `mergeWindowsIntoGroup`.
- Safe `g`/`s`/`m`; Vim `Shift+Super+n` / `Ctrl+Super+n` / `Shift+Super+m`.
- `FORGE_KEYBIND_PROFILES_DIR` + `forge keybind backup|apply`; RunSteps
  `layout-cycle` / `merge-group` / `float`.

## Residual

SL5 live thrash on black after Shell reload; Phase 2 groupify deferred.
