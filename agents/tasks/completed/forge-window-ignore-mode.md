# Task: window ignore mode (user config)

**Status:** done  
**Priority:** mid (post-RC fine; **not** RC-blocking)  
**Plan:** (none — standalone)  
**Branch:** `plan/forge-layout-cold-topology` (implement here; not isolated)  
**Created:** 2026-08-06  
**Updated:** 2026-08-09  

## Goal

Optional user config so Forge **completely ignores** a window class (or class+title), stronger than float.

**RC:** float-only is enough (Guake stays `mode: "float"`). This task is mid-priority product surface after RC.

## Why

Float = not tiled / not LFT, but Forge still tracks, may raise, borders, processFloats.  
Ignore = no tree node (or inert), no layout, no decoration, no session claim — true hands-off.

## Product sketch (finalize at implement)

| Piece | Direction |
| --- | --- |
| Config | Same family as `~/.config/forge/config/windows.json` — `mode: "ignore"` next to float/tile |
| Identify app | Hand-edit class ± title for v1; focused-window capture later |
| UX (later) | Prefs row and/or keybind “ignore focused” / “float focused” writing overrides |
| Safety | Undo by removing rule + Super+Shift+r; docs warn ignore skips session/tile |

## Acceptance (when implemented)

1. [x] `mode: "ignore"` in window overrides: matching windows never TILE and are not managed as FLOAT nodes (no slot, no open-commit, no tab chrome).  
2. [x] Documented difference vs float (`docs/user/rules.md`, schema, D020).  
3. [x] Unit tests for match + track path skip + drop on reload.  
4. [x] No hard-coded app brands in JS for ignore list — user config only.

## Out of scope for this task

- Shipping a built-in ignore list for Guake/ddterm  
- Prefs UI / keybind “ignore focused”  
- RC gate

## Context for the next agent

- **Entry:** `WindowManager.isWindowIgnored`, `trackWindow` early return, `_dropIfIgnored` / `_dropAllIgnoredWindows` on `reloadWindowOverrides` + late `notify::wm-class`
- **Match:** reuses `_matchesFloatRule` (class/title/id)
- **Tests:** `tests/unit/window/WindowManager-ignore-mode.test.js` (9)
- **Config:** `~/.config/forge/config/windows.json` + `config/windows.schema.json` enum
- **Live:** add ignore rule, Super+Shift+r (or HUP); window must not appear in `forge tree`

## Session note

**2026-08-09:** Shipped. `isWindowIgnored` + track skip + `_dropIfIgnored` on reload /
late wm-class; schema + rules.md + D020; units green. Prefs/keybind capture deferred.

**2026-08-06:** Filed mid-priority from product discussion. Float remains RC path for dropdowns.
