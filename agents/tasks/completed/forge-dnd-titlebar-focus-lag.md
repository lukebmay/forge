# forge-dnd-titlebar-focus-lag — Cold titlebar drop zones dead until tab peel

**Status:** done (agent); host eyes-on open  
**Plan:** (none)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-20

## Goal

Restore drop-zone paint for titlebar (and keep tab) DnD after shrink-probe era.
Also set env min floor defaults to **256×144**.

## Root cause

`updateMetaPositionSize` drove `_handleMoving` from **display focus**, not the
grabbed node. On Wayland, focus often lags the Mutter grab window → position-
changed never painted zones until a tab peel forced focus/activate. Grab-begin
already preferred the grab window for `trackCurrentMonWs` / `_draggedNodeWindow`,
but geom path ignored that snapshot. Stage track also armed **before**
`_draggedNodeWindow` was set.

## Fix

- Prefer `_draggedNodeWindow` (when `grabMode` set) over focus in
  `updateMetaPositionSize` for MOVING/RESIZING
- Set `_draggedNodeWindow` **before** `_armGrabPointerTrack`
- `FORGE_MIN_TILE_*` unset defaults → **256×144** (docs + tests)

## Acceptance

- [x] L0 min-tile + drop-intent + open-min + drag-drop + tab-drag **167**
- [x] Nest clean ok; `running: False`
- [ ] Host eyes-on after logout: titlebar zones **before** any tab peel

## Session note

Compare target: pre-probe titlebar path = Meta position-changed → `_handleMoving`.
Probe mid-grab had broken that; focus-lag residual remained after probe delete.
Installed dirty tip; Wayland host needs **logout once**.
