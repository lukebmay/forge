# Task: WR2 — Guake opens on correct monitor (Wayland)

**Status:** done (A/B AGREE)  
**Plan:** [forge-wayland-operator-residuals](../forge-wayland-operator-residuals.md)  
**Branch:** `plan/forge-wayland-operator-residuals`  
**Created:** 2026-08-06  
**Completed:** 2026-08-06  

## Problem

On Wayland, Guake (F12) opens on the **right** monitor. Expectation (X11): left by default; right only if focus is on the right.

## Acceptance (met)

1. Guake rehomed to focus/LFT mon (tile → LFT → focus-win → mon0)
2. mon0 / mon1 LFT cases covered by unit tests
3. Stays float; no pointer warp
4. Pure helper + WM integration tests
5. Tests green (window suite 529; WR2 suite 147)

## Session note

**2026-08-06 A/B AGREE:**

- `resolveFloatFocusMonitor` / `isFocusMonitorFloatClass` in `lft-mru.js`
- `_rehomeFocusFloatMonitor` on float trackWindow + Meta focus (Guake only)
- sticky grace via open sticky home so entered-monitor thrash does not undo
- Live: install + Wayland F12 with focus mon0 vs mon1
