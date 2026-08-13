# forge-canonical-contracts_ic3-tile-slot-authority — Restore unsolicited TILE geom

**Status:** done
**Plan:** [forge-canonical-contracts](../forge-canonical-contracts.md)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

TILE slot (`renderRect`) is authority. Apps that Meta-fullscreen or resize
without a user grab (VLC end-of-video) return to their tile. User
grab-resize still updates split percents.

## Acceptance

- [x] `notify::fullscreen` bound per TILE window (with existing size/pos)
- [x] Unsolicited size / maximize / fullscreen on TILE: unmaximize +
      unfullscreen + `reassertNodeToSlot` (not `onExternalGeometry`)
- [x] Live `grabMode` / forge echo / open-pending unchanged
- [x] Lone-tile maximize-on-single still allowed
- [x] Multi-tile full-maximize no longer floats the window (retire
      `_resolveExternalMaximize` float path)
- [x] `tree.apply` no longer permanently skips fullscreen windows once we
      have unfullscreened (apply must be able to place)
- [x] Units: fs + size-changed → slot; max flags → slot; grab RESIZING
      does not snap
- [x] AC1: verify scanner still does not reassert

## Context for the next agent

- Hub: `window.js` `updateMetaPositionSize`.
- Restore: `_restoreTileToSlot` → unmake_fs + unmaximize + `reassertNodeToSlot({ force: true })` under `_suppressGeom`.
- Predicate: `shouldRestoreTileSlot` in `layout-sensors.js`. Grab uses `forGrab: true` (max/fs only).
- `_resolveExternalMaximize` deleted (no more float-on-full-max).
- `tree.apply` still skips a **live** `is_fullscreen()` TILE (move on that surface fights Mutter). After IC3 unfullscreen, apply places — see fw8 "places after unfullscreened".
- D026 / catalog § Tile geometry. Zoom (Wave Z) is **not** this task.

## Session note

**2026-08-13 implement (orchestrator review).** D026 TILE-slot authority
on master. No commit/push.

**API**
- `shouldRestoreTileSlot(node, meta, ε, { isMaximized, isLoneMaximized, tilingEnabled, forGrab })` — pure; `forGrab` = max/fs only so live resize percents stay.
- `wm._restoreTileToSlot` — unfullscreen + unmaximize + `reassertNodeToSlot({ force: true })`.
- `notify::fullscreen` → same `updateMetaPositionSize` as size/position.
- Attribution: suppress/echo → chrome; open-pending → existing; live grab → existing handlers (max/fs ends grab + restore, never `_handleResizing`); lone max → leave; else TILE unsolicited max/fs/size → restore; leftover FLOAT → `onExternalGeometry` (AC1, no reassert).

**Files**
- `lib/extension/layout-sensors.js` — `shouldRestoreTileSlot`
- `lib/extension/window.js` — bind + restore path; `_resolveExternalMaximize` gone
- `lib/extension/tree.js` — apply skip comment only (still live-fs only)
- `docs/dev/rendering.md` — attribution table
- Tests: `bug-461-edge-snap` inverted; `bug-v4wh` / `geom-open-runsteps` / `bug-w-render-storm` TILE-drift; `layout-sensors` units; `bug-fw8` apply-after-unfs; e2e `test_fullscreen_tiled.py` now expects slot restore (not run)

**Proven**
```
npm test -- tests/regression/bug-461-edge-snap.test.js \
  tests/regression/bug-dyt2-lone-maximize-preserved.test.js \
  tests/unit/extension/layout-sensors.test.js \
  tests/regression/bug-w-render-storm.test.js \
  tests/regression/bug-v4wh-maximize-during-resize.test.js \
  tests/unit/extension/geom-open-runsteps.test.js \
  tests/regression/bug-fw8-fullscreen-tile-position.test.js
```
53 passed. Broader geom (open-commit, grab-fuzz, movement, fw8/zo4/351, placeholder, layout-controller/verify, WM-focus): 155+119 green.

**Leftovers**
- Live VLC / nest smoke not run (need `./install` + nest or logout).
- e2e `test_fullscreen_tiled.py` rewritten for D026, not executed.
- If live unfullscreen+move fights Mutter and loops: DESIGN-FLAW — do not add a VLC branch.
- Zoom (Wave Z) / IC2 / IC4 not this slice.
