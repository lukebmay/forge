# Task: D0 — Pure drop-zone geometry

**Status:** done  
**Plan:** forge-dnd-drop-zones  
**Branch:** `plan/forge-dnd-drop-zones`  
**Created:** 2026-08-08  

## Goal

Implement pure geometry for five stable drop zones per plan:
`agents/plans/forge-dnd-drop-zones.md` (locked geometry).

## Spec

Target unit rect `U` (frame):

1. Center `C`: half width/height of `U`, centered:
   - C.w = U.w/2, C.h = U.h/2
   - C.x = U.x + U.w/4, C.y = U.y + U.h/4

2. Four trapezoids TOP/RIGHT/BOTTOM/LEFT: each is the region between corresponding edges of C and U (polygon vertices from C corners + U corners).

3. Hit test: point-in-polygon for trapezoids; center rect wins when inside C. **Independent of grab origin.**

## Deliverables

- Pure module or exports in `lib/extension/` (prefer small pure helpers; e.g. extend `utils.js` or new `drop-zones.js` pure — no Mutter in pure tests).
- Functions roughly: `buildDropZones(rect) → { center, top, right, bottom, left }` (rects and/or polygons), `hitTestDropZone(zones, point) → ZONE | NONE`
- Keep DROP_ZONES enum compatibility with existing drag-drop.
- Unit tests with several aspect ratios, corners, center, outside U → NONE.
- Do **not** wire into drag-drop.js yet (D1) unless trivial reuse.

## Acceptance

- [x] Geometry matches plan formulas
- [x] Center wins over edge bands when inside C
- [x] Trapezoid hit tests cover full U without gaps (except maybe exact edges shared)
- [x] Vitest green for new tests
- [x] No live Shell install required

## Non-goals

D1 wire, D2 paint, D3 no-op polish, D4 live smoke.

## Session note

**Shipped (D0):** Pure five-zone geometry in `lib/extension/drop-zones.js` +
`tests/unit/extension/drop-zones.test.js` (19 tests green).

| Export | Role |
| --- | --- |
| `DROP_ZONES` | Canonical enum (utils re-exports) |
| `buildDropZones(rect)` | `{ unit, center{rect+poly}, top/right/bottom/left{polygon} }` |
| `hitTestDropZone(zones, point)` | CENTER > trapezoids > nearest-edge residual; outside → NONE |
| `hitTestDropZoneAt(rect, point)` | D1 convenience |
| `pointInPolygon` / `rectContainsPoint` | pure helpers |

**Not wired:** drag-drop.js still uses `calculateDropRegions` / `detectDropZone` (D1).

**Next:** D1 wire `detectDropZone` → new geometry; keep semantics table.
