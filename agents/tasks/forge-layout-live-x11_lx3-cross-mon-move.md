# LX3 — Cross-monitor window move (keybind)

**Status:** ready  
**Priority:** P1  
**Plan:** [forge-layout-live-x11](../plans/forge-layout-live-x11.md)  
**Branch:** `plan/forge-layout-live-x11`  
**Created:** 2026-08-06  

## Problem

After Nautilus was outside a tab group, **moving it across monitors failed**
(keybind Move direction toward the other monitor).

## Acceptance

1. From a tiled window that is a **mon-level child** (or only child of a mon
   CON that can edge-out), directional Move toward the adjacent monitor:
   - Meta window lands on target mon work area
   - tree parent is the target MONITOR node
   - no SEGV; no stuck GRAB_TILE
2. From a window **inside** a TABBED group at mon edge: either peel then cross
   (document), or one gesture that peels + crosses — pick one coherent path;
   do not silently no-op with no feedback if fixable.
3. Unit/regression covering `Tree.move` MONITOR branch +
   `safeMoveToMonitor` / geometry move-before-reparent (forge-e3k1).
4. Dual-mon live smoke on black X11 once code is in (agent can HUP).

## Likely areas

- `Tree.move` MONITOR case (`forge-s7ri`, `forge-e3k1`)
- Edge detection: only first/last mon child crosses — tab members may not
  qualify as mon edge
- `CommandHandler` Move + `commitLayout`
- Wayland residual `safeMoveToMonitor` (X11 still uses move path)

## Out of scope

- Tab chrome drag (LX4); layout dev structure (LX1)

## Session note

**2026-08-06:** Filed from operator: Nautilus cross-mon move failed on X11.
