# forge-tab-click-drag_pr9-move-app-crossmon-safety — Peel/MOVE APP + cross-mon freeze

**Status:** done
**Plan:** [forge-tab-click-drag](../../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Priority:** **P0** (session-killing freeze)
**Depends:** none — land before or serial with PR8 (shared `drag-drop.js`)

## Goal

1. **Safety:** Dragging a tab toward another monitor / foreign tab group
   must **never** freeze GNOME Shell / compositor. Cross-mon foreign
   strip is allowed only if D044-safe (move-then-join) **and** compositor
   stays responsive.
2. **Product:** Leave-strip MOVE APP (peel) must work: window enters
   grab-tile, **drop-zone overlay paints**, drop **commits** placement
   (edge / CENTER / empty-mon / wrap-in-slot / foreign-strip join when
   safe). Same path as titlebar grab-tile.

## Operator reports (source)

3. Drag tab across monitors to another tab group → **GNOME froze**
   (could not start non-GNOME terminal; SSH reboot). Fresh Wayland
   session + fresh forge install after PR6.
4. Drag tab to relocate window → **no placement overlay**; drop did
   nothing.

## Acceptance

- [x] **No freeze class:** During Mutter-owned grab, do **not** reparent
      live tab actors onto foreign strips / chrome layer in a way that
      can hang the compositor. Prefer spacer-only / ghost chip, or
      skip foreign float reparent while `state.started && !synthetic`.
      Cross-mon foreign join must not loop rehome/render on motion.
- [x] Peel (pointer leaves strip band) → `_startTabMoveGrab` → window
      `GRAB_TILE` → `_handleMoving` paints zones when
      `_previewHintsWanted()` (mod `None` → always; host has
      `preview-hint-enabled=false` but mod is `None` so hints must
      still paint via `allowDragDropTile`).
- [x] Grab-end with valid zone commits via existing
      `moveWindowToPointer` / foreign-strip join; not a no-op when
      `allowDragDropTile()` is true.
- [x] Cross-mon join still D044 (rehome then join); no spanning chrome.
- [x] If full foreign-strip float during Mutter grab is unsafe on
      Wayland: **degrade gracefully** (tile zones + CENTER join /
      commit-at-index without reparenting source tab mid-grab) — do
      **not** invent a second DnD engine; open hard design note only
      if product gap remains.
- [x] Unit: peel path enters grab; foreign preview during Mutter grab
      does not reparent source tab (or equivalent safety assert);
      freeze-prone path guarded.
- [x] Nest mon=1 peel synthetic path if unit cannot prove; dual-mon
      only if needed; **stop nest when done**. Prefer nest over host
      thrash for freeze-class repro. *(skipped — unit proves peel AABB +
      foreign spacer-only + join-at-index)*
- [x] L0 green: tab-strip + DnD comprehensive + normalize + Tree-ops.
- [x] No commit/push unless asked.

## Context for the next agent (complete + succinct)

### Roots fixed

| Bug | Root | Fix |
| --- | --- | --- |
| Peel no overlay / drop no-op | REORDER float chip included in strip hit AABB → pointer always “on strip” → never `_startTabMoveGrab` | `_tabDragPointerOnStrip`: exclude floating chip; prefer siblingSnap homes + decoration |
| Cross-mon freeze | `_beginForeignStripPreview` → `_beginTabReorderFloat` reparented live tab mid-Mutter grab | Foreign preview **spacer-only** (`chipFloating` stays false); join-at-index commit unchanged |

### Also

- Pass press `event.get_device()` into `begin_grab_op` (was always null).
- Product gap (acceptable): no live float chip on foreign strip mid-grab — gap spacer + index commit only. Same-strip REORDER float unchanged.

### Files

| File | Change |
| --- | --- |
| `lib/extension/drag-drop.js` | peel AABB; foreign spacer-only; device on grab |
| `tests/unit/extension/tab-strip-reorder.test.js` | peel AABB, paint gate, foreign no-reparent |
| `tests/unit/window/WindowManager-drag-drop-comprehensive.test.js` | Mutter GRAB_TILE foreign spacer-only |
| `tests/unit/window/WindowManager-tab-drag.test.js` | device passed to begin_grab_op |

### L0

```bash
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-normalize-group-home.test.js \
  tests/unit/tree/Tree-operations.test.js \
  tests/unit/window/WindowManager-tab-drag.test.js
# 194/194 green
```

### Residual (host dual-mon eyes-on)

- Foreign strip: spacer gap only (no floating chip visual) until/unless a
  non-reparent ghost is added later — not a freeze class.
- Peel via real `begin_grab_op` still depends on Mutter grab-op-begin for
  GRAB_TILE; synthetic path unit-proven; host Wayland should pass device
  now.
- PR8 (chip min-width + equal-fill) is next P1 — serial after PR9.

## Session note

**2026-08-17 (PR9 implementer):** **done**.

Peel was stuck in REORDER because the floating chip’s screen rect expanded
the strip AABB to always contain the pointer. Foreign freeze class fixed by
never reparenting the live tab during foreign-strip preview (spacer +
`_foreignStripCommit` insert index only). No second DnD engine. D044
untouched. Nest skipped. No commit/push.
