# Task: D4 — Cross-monitor targets + plan close

**Status:** done  
**Plan:** forge-dnd-drop-zones  
**Branch:** `plan/forge-dnd-drop-zones`  
**Created:** 2026-08-08  
**Completed:** 2026-08-08  

## Goal

1. During drag-tile, preview/hit targets include **all tiles on the active workspace** (all monitors), not only one head.
2. Cross-mon hover paints five-zone indicators on the hovered foreign-mon tile.
3. Unit/regression coverage for multi-mon target list if pure logic extractable.
4. Close plan: mark forge-dnd-drop-zones done; update PRIORITY/HANDOFF; merge-ready on plan branch.
5. Live dual-4K operator smoke is **soft** — document checklist in plan; do not block code completion if Shell not available.

## Acceptance

- [x] Cross-mon tile under pointer is a valid drop target for hit + paint
- [x] No sticky previews when leaving mon
- [x] Tests green (unit)
- [x] Plan status complete; residual live smoke listed as optional operator check
- [x] Local commit; no push

## Session note

**Shipped:**

| Piece | Detail |
| --- | --- |
| Pure filter | `isEligibleDragDropTargetNode` / `collectDragDropTargetMetaWindows` in `drag-drop.js` |
| Snapshot | `trackCurrentMonWs` uses pure filter; **no** `get_current_monitor()` gate (workspace-wide) |
| Hit | `_findNodeWindowAtPointer` walks stage-global frames (mon1 x≥1920) |
| Motion | `_handleMoving` refreshes targets each move; hide when no tile under pointer |
| Tests | `tests/regression/forge-d4-cross-mon-dnd-targets.test.js` (7) |

**Optional operator smoke (dual 4K):**

1. Tile on mon0 + mon1; drag mon0 tile over mon1 → five-zone preview on mon1.
2. Move pointer off mon1 tile (gap/chrome) → preview clears (no sticky).
3. Drop LEFT/CENTER on mon1 tile → structure lands on mon1; grab-end clears actors.
4. Journal: no throw mid cross-mon drag.

**Next:** plan complete; soft live smoke when operator free.
