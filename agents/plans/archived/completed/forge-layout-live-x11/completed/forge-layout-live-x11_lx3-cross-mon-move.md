# LX3 — Cross-monitor window move (keybind)

**Status:** done  
**Priority:** P1  
**Plan:** [forge-layout-live-x11](../../forge-layout-live-x11.md)  
**Branch:** `plan/forge-layout-live-x11`  
**Created:** 2026-08-06  
**Taskforce:** A/B AGREE  

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

**2026-08-06 B (verifier): AGREE**

### Review

- Diff is the right fix: `next()` already encodes mon-tree directional edge;
  first/last mon-child gate was a false extra filter that blocked nested /
  VSPLIT-mid after LX2. Dropping the same-mon MONITOR `else` peel is correct
  for that case (that branch was the failed-gate path, not display-edge wrap).
- e3k1 order preserved (rect → `extWm.move` → reparent); throw aborts reparent.
- s7ri display-edge (`next === -1`) still uses `ownMonNode` only; pointer mon
  cannot teleport. `nextMonitor` tree-index-first strengthens that under lag.
- LX2: cross-mon peel sets `parentTarget` to neighbor mon so
  `peeledToPair` (`parentNode.parentNode === parentTarget`) does not fire on
  the destination mon — no wrong H/V on target.
- `rectForMonitor` clone fixes pre-throw in-place mutate; TILE null-rect frame
  fallback is safe.
- Interior accidental cross: not introduced — MONITOR only when same-orientation
  siblings exhausted up to mon (HSPLIT mid still hits WINDOW/CON next).
- GRAB_TILE: `move()` still does not special-case it (pre-existing residual;
  not regressed by this gate drop). Command path still `wm.tree.move`.

### Tests re-run (B)

```
forge-lx3 + s7ri + e3k1 + WindowManager-movement → 36 passed
forge-lx2-tab-extract + bug-213-movement → 18 passed
tests/regression/ entire → 134 files, 543 passed
```

### Residual (non-blocking)

- No dedicated “HSPLIT interior mid does not cross” unit assert (logic clear
  via `next()`; optional polish).
- GRAB_TILE thrash / live mon-order X11 reverse still out of scope as A noted.

### A live smoke

Nested Nautilus mon1→mon0 accepted as stated; B did not re-HUP.

### A implement summary (for wrap-up)

Root cause: MONITOR cross required mon first/last child; nested/VSPLIT mid never
crossed. Fix: always geometry-then-reparent when `next` is neighbor MONITOR;
`nextMonitor` tree mon first; `rectForMonitor` clone + TILE frame fallback.
Files: `lib/extension/tree.js`, `window.js`, `tests/regression/forge-lx3-cross-mon-move.test.js`.
Live: nested Nautilus mon1 Shift+Super+h → mon0 OK.
