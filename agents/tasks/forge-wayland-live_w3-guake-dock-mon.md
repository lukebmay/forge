# Task: forge-wayland-live_w3-guake-dock-mon

**Status:** ready for verify  
**Plan:** [forge-wayland-live.md](../plans/forge-wayland-live.md)  
**Branch:** `plan/forge-wayland-live`  
**Created:** 2026-08-04

## Problem

1. **Guake F12** opens on the wrong monitor. Forge only floats Guake
   (`windows.json`); geometry is Guake/Mutter. Users expect quake on the
   **monitor that has focus** (focused window’s monitor, not only pointer).
2. **Dock launches** record `global.display.get_current_monitor()` (pointer
   mon). On multi-mon Wayland, pointer and focus often diverge — sticky mon
   should prefer **focused window’s monitor** when a focus window exists.

## Acceptance

1. Helper e.g. `resolveFocusMonitor()`:
   `focusMetaWindow?.get_monitor() ?? get_current_monitor()`, with safe guards
   for null/destroyed.
2. **Dock launch hook** uses that helper instead of raw `get_current_monitor()`.
3. **Guake (and optional float-follow list):** on map of float Guake (wmClass
   match case-insensitive `Guake`), `safeMoveToMonitor` to focus monitor (and
   optionally keep top-strip if Guake already positions — mon move is enough).
   Prefer small allowlist (Guake) over all floats. Do not add Guake to LFT.
4. Unit tests with mocks: focus on mon0, `get_current_monitor` → 1 → dock notes
   mon0; Guake track/move uses mon0.
5. Tests green; no X11 regression for normal tiling opens.

## Out of scope

- Changing Guake’s own height/animation prefs.
- Full layout thrash (W4).

## Session note

**2026-08-04 (A):** Shipped W3.

- `WindowManager.resolveFocusMonitor()` — focus mon when valid, else current.
- Dock hook notes focus mon via `resolveFocusMonitor()`.
- Guake float-follow allowlist (`_isFloatFollowWindow` / `_applyFloatFollowMonitor`):
  case-insensitive equals/contains `guake`; home mon override + map move + late
  `notify::wm-class`. Not LFT.
- Tests: `tests/unit/window/WindowManager-focus-monitor.test.js` (8).
- Related window unit + W1/placement regressions green (489).
