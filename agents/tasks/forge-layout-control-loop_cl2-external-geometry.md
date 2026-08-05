# Task: forge-layout-control-loop_cl2-external-geometry

**Status:** ready  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05

## Goal

Route **external** geometry/monitor sensors through the control loop: mark the
forest **unsettled**, debounce **verify** (and layout when needed), and keep
**Forge-caused** apply noise from thrashing (suppress / attribution). Builds on
CL0 debounce + CL1 `markUnsettled` / scan.

## Acceptance

1. **Attribution helper(s)** (prefer pure + injectable):
   - Detect when a size/position (or mon) signal is under existing Forge suppress
     flags (e.g. `_suppressGeometrySignalRetile` or equivalent used in window.js
     for W-storm / move). Name and document the API.
   - `isForgeCausedGeometrySignal(wm, metaWindow)` (or similar) returns true when
     we should **not** treat the event as external thrash.
2. **External path:**
   - On external size-changed / position-changed (and mon change if cheap): call
     `layoutController.markUnsettled(reason)` and `requestVerify(reason)` (and/or
     `requestLayout` when existing behavior already retiled — **do not** regress
     intentional retile for real external drift; prefer verify-first when already
     in-slot chrome-only W-storm path still works).
   - Integrate with existing handlers in `window.js` trackWindow — minimal
     surgical change; do not rewrite all of open path.
3. **Suppress discipline:**
   - Our `move` / apply path continues to set suppress as today (W-storm); CL2
     must **read** it, not invent a second competing suppress system unless the
     existing one is clearly insufficient (then document why).
4. **Agreement:** any external event → agreement counter 0 (via markUnsettled).
5. **Unit / regression tests** (high value):
   - Forge-suppressed signal → no markUnsettled / no thrash request storm
   - External signal → markUnsettled + requestVerify scheduled
   - After SETTLED, external size-changed drops settled
   - W-storm related tests still green if present
6. **`npm test`** green.
7. Do **not** implement thrash catalog (CL3), open batch N (CL4), soft-rehome rename.

## Implementation hints

- Grep window.js for `size-changed`, `position-changed`, `_suppress`,
  `in-slot`, storm, retile.
- Prefer extracting a tiny `layout-sensors.js` or methods on LayoutController
  (`onExternalGeometry(reason, metaWindow)`) so tests can call without full Meta.
- Keep logging behind Logger.debug.

## Session note

(ready — not started)

**Git:** Stay on `plan/forge-layout-control-loop`. Leave wayland-live stash alone.
