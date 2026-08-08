# Task: D0 — Pure drop-zone geometry

**Status:** in progress  
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

- [ ] Geometry matches plan formulas
- [ ] Center wins over edge bands when inside C
- [ ] Trapezoid hit tests cover full U without gaps (except maybe exact edges shared)
- [ ] Vitest green for new tests
- [ ] No live Shell install required

## Non-goals

D1 wire, D2 paint, D3 no-op polish, D4 live smoke.
