# Task: forge-wayland-live_residual-smoke

**Status:** ready — **operator / live**  
**Plan:** historical [forge-wayland-live](../plans/) on branch `plan/forge-wayland-live`; residual runs on **`plan/forge-layout-control-loop`**  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05  
**Host:** black — dual 4K @ 1.5; GNOME Shell 46

## Goal

Confirm Forge is daily-driver safe on **Wayland** after control-loop CL8–CL11 + preflight (SEGV-safe `move_to_monitor`, cross-mon move, rival tilers off).

## Preflight (agent done)

- [x] `safeMoveToMonitor` refuses mon=-1 / dead / no actor / no workspace
- [x] `move()` dest mon + 4px epsilon + alive guard
- [x] Rival GNOME Shell tilers disabled on install/enable
- [x] Unit tests green (2160)
- [x] Debug install + logging on (X11 HUP); **Wayland needs logout**

## Operator steps

1. Log out → **GNOME on Wayland**.
2. Confirm Forge:

```bash
forge ping
gsettings get org.gnome.shell disable-user-extensions   # false
```

3. Sole Ghostty (or clean-ish) → `forge layout dev` → `forge tree`.
4. Walk focus mon0 ↔ mon1; tab switches; Guake F12 if used.
5. Optional thrash (W4): Super+Delete lock → unlock → `forge tree` (no thrash / crash).
6. Note residuals only (do not redesign mid-smoke).

## Pass criteria

| Check | Expect |
| --- | --- |
| Enable | Forge ACTIVE; not in safe-mode (`disable-user-extensions` false) |
| Topology | mon0 TABBED(Chrome,Grok)\|ghostty; mon1 ghostty\|TABBED(YouTube,Gmail,Voice) (or current dev profile) |
| Cross-mon | YouTube Meta mon + frame on mon1 (not stuck mon0) |
| Focus | No page reflow on every tab/focus; windows stay at slot size |
| Open batch | No temporary sliver thrash mid-`layout dev`; residual focus correct |
| Chrome | Apply overlay never sticks (≤8s) |
| Borders | Focus ring roughly matches tile; does not steal clicks |
| Shell | No crash on Nautilus open/close or title path changes |
| Guake | F12 does not yank pointer under tab strip (if installed) |

## Fail → record

| Symptom | Capture |
| --- | --- |
| Shell crash | journal snippet; last app; mon count |
| Forge gone after crash | `gsettings get org.gnome.shell disable-user-extensions` |
| Wrong mon | `forge tree` + which app |
| Reflow / storm | focus action sequence; log level 5 if needed |
| Layout incomplete | which apps missing; open wait timeout? |

## Session note

**2026-08-05 prep:** Stash applied onto control-loop + move() port from wayland branch (dest mon / epsilon). Install `v49-90-beta.2-155-gd81e4e2-dirty` on X11. Awaiting operator Wayland logout smoke.
