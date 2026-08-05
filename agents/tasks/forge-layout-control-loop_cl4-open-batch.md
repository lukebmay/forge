# Task: forge-layout-control-loop_cl4-open-batch

**Status:** ready  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05

## Goal

Replace the blind open `createDelay` (50/200ms → `renderTree`) with the control-loop
**open = batch N=1** path: admit → identity + client quiet (catalog minQuietMs /
built-in) → one debounced `requestLayout` → verify (CL1) → thrash-extra (CL3).
This is the product path for **sole Ghostty** desync (size thrash after map).

## Acceptance

1. **Open pipeline helper** (testable): given open context (isDock, wmClass,
   catalog entry, last external geometry time), compute:
   - min quiet ms (dock short floor OK, e.g. 50; default ~150–200; thrashy/catalog
     minQuietMs; first-open longer optional up to plan max wait 2.5s cap for
     commit-anyway)
   - whether quiet has been met
2. **Replace** `trackWindow` fixed `createDelay` + direct `renderTree("window-create")`
   with:
   - `recordOpen` on catalog for the class
   - schedule open settle that waits for quiet (event-driven preferred: on
     external size/pos, reset quiet timer; or trailing timeout of minQuietMs from
     last non-Forge geometry / from map)
   - then `requestLayout("window-create")` (or force path if freeze needs force —
     prefer requestLayout; if force required for freeze, document and use
     renderTree once then still verify via post-render)
   - max wait: if not quiet by `OPEN_COMMIT_MAX_WAIT_MS` (~2500), commit anyway +
     verify loop
3. **Dock** may keep short min quiet (50ms) but still goes through requestLayout
   not a parallel philosophy.
4. **Ghostty / thrashy:** uses catalog minQuietMs; thrash-extra after SETTLED already
   from CL3.
5. **Unit tests** (high value):
   - default open quiet delay
   - ghostty uses ≥ built-in minQuiet
   - quiet reset on external size-changed before fire
   - max-wait forces commit
   - dock short floor
   - single requestLayout (not N renders) for rapid synthetic multi-open if
     multi-open queue is in scope; N=1 is minimum
   - existing open-app policy tests still green
6. **`npm test`** green.
7. Do **not** implement full layout CLI multi-open residual (CL5). Do **not**
   rename soft-rehome. Live Ghostty on black is CL7 (optional note if not runnable).

## Implementation hints

- Current code ~`window.js` trackWindow: `createDelay = openPlan.isDock ? 50 : 200`
  then `queueEvent` / timeout → `renderTree("window-create", true)`.
- Prefer a small `lib/extension/layout-open.js` pure helpers + WM methods
  `_scheduleOpenCommit(metaWindow, openPlan)` / cancel on destroy.
- Cancel pending open commit on window destroy.
- Identity: wm_class usable (non-null) — if still null, wait for notify::wm-class
  or max-wait (processFloats already re-renders on class).
- Coordinate with `_suppressGeometrySignalRetile` — open quiet counts **external**
  only.

## Session note

(ready — not started)

**Git:** Stay on `plan/forge-layout-control-loop`. Leave wayland-live stash alone.
