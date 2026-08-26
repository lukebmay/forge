# Task: forge-layout-control-loop_cl2-external-geometry

**Status:** done  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05  
**Completed:** 2026-08-05

## Goal

Route **external** geometry/monitor sensors through the control loop: mark the
forest **unsettled**, debounce **verify** (and layout when needed), and keep
**Forge-caused** apply noise from thrashing (suppress / attribution).

## Acceptance

All met (A + B AGREE): suppress on move/apply; in-slot chrome; external →
`onExternalGeometry` (unsettled + layout + verify); tests green (2018).

## Session note

**2026-08-05:** CL2 done.

### Shipped
- `layout-sensors.js` — `isForgeCausedGeometrySignal`, `shouldChromeOnlyGeometry`
- `LayoutController.onExternalGeometry`
- WM `_suppressGeometrySignalRetile` on `move` + `tree.apply`
- `updateMetaPositionSize` attribution (suppress / in-slot / external)
- Tests: layout-sensors, bug-w-render-storm, controller

### Next
- CL3 app thrash catalog + built-in ghostty
