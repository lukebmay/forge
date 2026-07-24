# T5 — Keybind system (safe defaults, presets, save/load)

**Date:** 2026-07-24  
**Plan:** forge-daily-driver  
**Task:** [completed](../../plans/forge-daily-driver/completed/forge-daily-driver_t5-keybind-system.md)

## What / why

Bare Super+ defaults fought launchers/GNOME; mixed modifiers had no grammar;
Super+arrows still felt user-space. Power users need recommended Super+ kits and
easy save/load after tweaks.

## Design

- **Safe** = install default only, **not recommended** — no bare Super+ at all;
  primary **`Ctrl+Super`**, secondary **`Ctrl+Shift+Super`** for twins.
- **Kits:** Safe, Vim, i3 (recommended Super+ loadouts) + **Your kits** save/load.
- **Conflicts:** scan Forge∪GNOME; prefs banner + confirm on Super+/recommended kits.
- GNOME Settings does not list extension binds — cheatsheet + prefs are truth.

## Residual

Live smoke kit apply/confirm + conflict banner on host. Existing GSettings
unchanged until kit/restore/import.
