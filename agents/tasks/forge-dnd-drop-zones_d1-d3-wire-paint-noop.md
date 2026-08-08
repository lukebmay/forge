# Task: D1–D3 — Wire geometry, paint five zones, no-op path

**Status:** in progress  
**Plan:** forge-dnd-drop-zones  
**Branch:** `plan/forge-dnd-drop-zones`  
**Created:** 2026-08-08  

## Depends on
D0 complete: `lib/extension/drop-zones.js` (`buildDropZones`, `hitTestDropZone`, `hitTestDropZoneAt`)

## Goals (plan D1 + D2 + D3)

### D1 Wire
- `drag-drop.js` hover path: use `hitTestDropZoneAt(targetRect, pointer)` (or build once + hit) instead of `calculateDropRegions` + old band `detectDropZone` for **hit testing**.
- Keep drop **semantics** table from plan (TOP/RIGHT/BOTTOM/LEFT/CENTER → VSPLIT/HSPLIT/group).
- Preview regions for paint can use new zone polygons.

### D2 Paint all five
While drag-tile active and pointer over a valid unit:
1. Draw all five regions lightly (outline + low alpha fill).
2. Hovered region: higher alpha + existing `window-tilepreview-*` color class.
3. Grab-end / cancel / disable / failsafe: destroy all preview actors (no sticky).

### D3 No-op
- Same zone as source / already correct structure → no-op (paint zone OK, no structure change).
- Existing `_isNoOpDrop` should still work; extend if needed for trapezoid zones.
- Regression: re-drop same slot must not thrash HSPLIT/VSPLIT.

## Acceptance
- [ ] Hover hit uses D0 geometry
- [ ] All five zones visible while hovering a tile during drag
- [ ] Hovered zone emphasized
- [ ] Failsafe/clear destroys previews
- [ ] Same-slot / identity no-op preserved (tests if pure; comments if only runtime)
- [ ] Unit tests for any pure helpers; `npm test` / vitest green for touched paths
- [ ] No force live Shell unless cheap; D4 is live smoke later

## Non-goals
D4 dual-4K live operator smoke; Super peek setting changes.

## Hints
- `lib/extension/drag-drop.js` `_showDropPreview`, `moveWindowToPointer`
- Styles: `stylesheet.css` / `window-tilepreview-*`
- Plan: `agents/plans/forge-dnd-drop-zones.md`
