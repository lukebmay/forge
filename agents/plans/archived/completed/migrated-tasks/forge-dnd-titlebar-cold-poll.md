# forge-dnd-titlebar-cold-poll — Titlebar overlays without prior tab peel

**Status:** done (agent); tip eyes-on soft  
**Plan:** residual of [forge-open-min-dnd-cold-wayland](../plans/forge-open-min-dnd-cold-wayland.md)  
**Branch:** master  
**Updated:** 2026-08-25

## Goal

Titlebar/CSD TILE drag shows drop-zone overlays on first grab (Chrome/PWA over
Ghostty) without requiring a prior tab-strip gesture.

## Cause

Stage `captured-event` alone is often silent under a live Mutter MOVING grab on
Wayland CSD. Tab peel already had `tabDragPointer` poll; titlebar only had stage
track + Meta geom. `_showDropPreview` also no-op'd when `previewHint` was missing
instead of ensuring actors.

## Fix

- `_armGrabPointerTrack` also arms `grabPointerPoll` (~8ms; skip synced xy)
- `_showDropPreview` always `_ensurePreviewActors`
- contracts row updated

## L0

`WindowManager-drag-drop.test.js` — 30 green (incl. cold poll case)

## Host

Tip reload, then titlebar-drag Grok over Ghostty **before** any tab peel → zones
visible; drop commits with tile mod / preview-hint as usual.
