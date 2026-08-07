# Task: WR2 — Guake opens on correct monitor (Wayland)

**Status:** ready  
**Plan:** [forge-wayland-operator-residuals](../plans/forge-wayland-operator-residuals.md)  
**Branch:** `plan/forge-wayland-operator-residuals`  
**Created:** 2026-08-06  
**Depends:** preferably after WR1 (same branch OK)

## Problem

On Wayland, Guake (F12) opens on the **right** monitor. Expectation (X11):

- **Default / focus on left** → Guake on **left**
- **Focus on right** → Guake on **right**

Evidence:

- Guake is float via `windows.json` (`wmClass: Guake`)
- Guake gsettings: `mouse-display=true`, `display-n=0`
- Guake uses GDK `pointer.get_position()` + `get_monitor_at_point` when mouse-display
- Session-layout save: Guake **mon=1** on Wayland
- Pointer warp / focus-follow may not match what Guake’s GDK seat sees on Wayland

## Acceptance

1. When a Guake window maps or is shown, Forge places it on the **focus / LFT monitor** (tiled focus preferred; else mon with keyboard focus window; else mon0 / primary-left policy documented in code comment only if non-obvious).
2. With focus on mon1 tile, Guake appears on mon1; with focus on mon0, on mon0.
3. Does **not** tile Guake (stays float); does not yank pointer under tab strip (existing smoke).
4. Unit test(s) for monitor selection helper / float rehome policy (pure function preferred).
5. Relevant tests green.

## Out of scope

- Patching Guake upstream
- Changing global mouse-display for all users without Forge

## Paths

- `lib/extension/window.js` — trackWindow / float map / entered-monitor
- Possibly small helper next to monitor-recovery / focus LFT
- `config/windows.json` only if a new override key is required (prefer code path for Guake class)

## Session note

(empty)
