# Task: D1–D3 — Wire geometry, paint five zones, no-op path

**Status:** done  
**Plan:** forge-dnd-drop-zones  
**Branch:** `plan/forge-dnd-drop-zones`  
**Created:** 2026-08-08  
**Completed:** 2026-08-08  

## Depends on
D0 complete: `lib/extension/drop-zones.js` (`buildDropZones`, `hitTestDropZone`, `hitTestDropZoneAt`)

## Goals (plan D1 + D2 + D3)

### D1 Wire
- [x] `drag-drop.js` hover path uses `hitTestDropZone` / `buildDropZones` (not edge-band `calculateDropRegions` + `detectDropZone` for hit)
- [x] Drop semantics table preserved (TOP/RIGHT/BOTTOM/LEFT/CENTER → VSPLIT/HSPLIT/group)

### D2 Paint all five
- [x] All five regions painted lightly (`window-tilepreview-zone`) while hovering a tile
- [x] Hovered region uses existing `window-tilepreview-*` class
- [x] Grab-end / cancel / disable / failsafe destroy multi-zone actors

### D3 No-op
- [x] Same-slot / identity no-op preserved (`_isNoOpDrop`); self-drop explicit
- [x] Regression: re-drop same BOTTOM on VSPLIT sibling still no-op

## Acceptance

- [x] Hover hit uses D0 geometry
- [x] All five zones visible while hovering a tile during drag (multi-actor path)
- [x] Hovered zone emphasized
- [x] Failsafe/clear destroys previews
- [x] Same-slot / identity no-op preserved
- [x] Unit tests green (drop-zones, drag-drop, comprehensive, bug-175, grab-fuzz)
- [x] No live Shell required (D4 later)

## Session note

**Shipped (D1–D3):**

| Piece | Detail |
| --- | --- |
| Hit | `moveWindowToPointer` → `buildDropZones` + `hitTestDropZone` |
| Paint pure | `zonePaintRects` / `zonePaintRect` / `PAINT_ZONE_ORDER` in `drop-zones.js` |
| Paint live | `_ensurePreviewActors` → St.Widget + 5 St.Bin children; light + hover class |
| Clear | `clearAllPreviewHints` also nulls `previewZoneActors` |
| CSS | `.window-tilepreview-zone` light outline/fill |
| Tests | single-bin mocks still work; multi-zone paint + clear tests added; corner test matches trapezoids |

**Residual for D4:** cross-mon target refresh + live dual-4K smoke; paint AABBs use non-overlap partition (corners assigned TOP/BOTTOM) — hit still trapezoid (corner paint vs hit may differ slightly).

**Next:** D4 cross-mon + live smoke.
