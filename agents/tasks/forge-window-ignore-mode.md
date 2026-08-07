# Task: window ignore mode (user config)

**Status:** ready  
**Priority:** mid (post-RC fine; **not** RC-blocking)  
**Plan:** (none — standalone)  
**Branch:** `task/forge-window-ignore-mode` when started  
**Created:** 2026-08-06  

## Goal

Optional user config so Forge **completely ignores** a window class (or class+title), stronger than float.

**RC:** float-only is enough (Guake stays `mode: "float"`). This task is mid-priority product surface after RC.

## Why

Float = not tiled / not LFT, but Forge still tracks, may raise, borders, processFloats.  
Ignore = no tree node (or inert), no layout, no decoration, no session claim — true hands-off.

## Product sketch (finalize at implement)

| Piece | Direction |
| --- | --- |
| Config | Same family as `~/.config/forge/config/windows.json` — e.g. `mode: "ignore"` next to float/tile |
| Identify app | Prefer focused-window capture (class ± title) over hand-typing wmClass |
| UX (later) | Prefs row and/or keybind “ignore focused” / “float focused” writing overrides |
| Safety | Easy undo; warn that ignored windows skip session layout / tile ops |

## Acceptance (when implemented)

1. `mode: "ignore"` (name TBD) in window overrides: matching windows never TILE and are not managed as FLOAT nodes for layout (no slot, no open-commit, no tab chrome).  
2. Documented difference vs float.  
3. Unit tests for match + track path skip.  
4. No hard-coded app brands in JS for ignore list — user config only.

## Out of scope for this task

- Shipping a built-in ignore list for Guake/ddterm  
- RC gate

## Session note

**2026-08-06:** Filed mid-priority from product discussion. Float remains RC path for dropdowns.
