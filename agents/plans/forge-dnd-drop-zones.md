# Plan: Stable DnD drop zones + indicators

**Status:** in progress (implement)  
**Priority:** mid (post RC / after cross-mon + no-op hardening)  
**Created:** 2026-08-08  
**Updated:** 2026-08-08 (implement start)  

### Session note

**D0 done:** pure geometry in `lib/extension/drop-zones.js` + vitest
`tests/unit/extension/drop-zones.test.js`. API: `buildDropZones`,
`hitTestDropZone`, `hitTestDropZoneAt`, `DROP_ZONES` (utils re-exports).
**Next: D1** wire drag-drop detect → new geometry (do not paint yet).

---

## Problem

1. Drop-zone hit testing is **unstable** (edge bands + nearest-corner bias).
   Cursor start on the dragged window may appear to matter; it must **not**.
2. Only the **active** zone paints today; operators cannot see the five regions.
3. Returning a window to its **same** slot can still restructure (e.g. VSPLIT →
   HSPLIT via LEFT/RIGHT corner win).
4. Cross-monitor drag often shows **no hints** (target resolution).

---

## Goals

1. **Five stable zones** over every target tile unit: TOP, RIGHT, BOTTOM, LEFT,
   CENTER — geometry independent of grab origin.
2. **Always-visible** outlines while hovering a tile (translucent); **hovered**
   zone colorized with alpha (current behavior = only that piece).
3. **Same zone as source / no clear unit** → **no-op** (no structure change).
4. Grab-end + failsafe still clear all preview actors (no sticky overlay).

---

## Geometry (locked)

Target unit = destination tile’s frame rect `U` (the hovered window/unit).

1. **Center rectangle `C`:** same aspect ratio as `U`, **half width and half
   height** of `U`, centered in `U`.

   ```text
   C.w = U.w / 2
   C.h = U.h / 2
   C.x = U.x + U.w / 4
   C.y = U.y + U.h / 4
   ```

2. **Four trapezoids:** connect each corner of `C` to the corresponding corner
   of `U` — regions = TOP / RIGHT / BOTTOM / LEFT.

3. Hit test: point-in-polygon (or half-plane) for trapezoids; `C` wins in center.
   **Independent of where the drag started on the source window.**

---

## Drop semantics (locked)

| Zone | Result |
| --- | --- |
| **TOP** | VSPLIT: **source above**, destination below |
| **RIGHT** | HSPLIT: destination left, **source right** |
| **BOTTOM** | VSPLIT: destination above, **source below** |
| **LEFT** | HSPLIT: **source left**, destination right |
| **CENTER** | Add to group (join TABBED/STACKED, or create tabbed group) |

**No-op when:**

- Pointer is not over another tile unit (gap / chrome / empty), or
- Resulting parent + order + layout would match current structure (e.g. already
  bottom of VSPLIT with that sibling; drop BOTTOM on top sibling again).

Nested tab/stack CONs: edge zones **wrap the whole group** (already fixed path
`shouldWrapTargetCon`); center joins the group.

---

## Indicator UX

While drag-tile is active and pointer is over a valid unit:

1. Draw all five regions lightly (outline + low alpha fill).
2. Hovered region: higher alpha + existing `window-tilepreview-*` color class.
3. Cross-monitor: same painting; target list must include **all tiles on the
   active workspace** (all monitors).
4. On grab-end / cancel / disable / failsafe: destroy all preview actors.

---

## Non-goals (this plan)

- Keyboard resize preview
- Competing-tiler coexistence
- Perfect pixel match after drop (apply contract residuals stay)

---

## Implementation slices (later)

| ID | Work |
| --- | --- |
| **D0** | Pure geometry: build zones from rect; point test; unit tests — **done** |
| **D1** | Wire `detectDropZone` → new geometry; keep semantics table |
| **D2** | Paint all five regions + hover emphasis; failsafe/clear |
| **D3** | Explicit no-op path + regression (same-slot VSPLIT) |
| **D4** | Cross-mon target refresh + live smoke dual 4K |

---

## Related

- Immediate: cross-mon `sortedWindows`, identity no-op, corner bias interim
- [forge-tab-chrome-drag.md](./forge-tab-chrome-drag.md)
- `lib/extension/drag-drop.js`, `lib/extension/utils.js` (`calculateDropRegions`)


### Next

**D1** wire `detectDropZone` / drag-drop hover to `hitTestDropZone` (no paint yet).
