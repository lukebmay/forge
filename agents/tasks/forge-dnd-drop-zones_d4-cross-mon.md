# Task: D4 — Cross-monitor targets + plan close

**Status:** in progress  
**Plan:** forge-dnd-drop-zones  
**Branch:** `plan/forge-dnd-drop-zones`  
**Created:** 2026-08-08  

## Goal

1. During drag-tile, preview/hit targets include **all tiles on the active workspace** (all monitors), not only one head.
2. Cross-mon hover paints five-zone indicators on the hovered foreign-mon tile.
3. Unit/regression coverage for multi-mon target list if pure logic extractable.
4. Close plan: mark forge-dnd-drop-zones done; update PRIORITY/HANDOFF; merge-ready on plan branch.
5. Live dual-4K operator smoke is **soft** — document checklist in plan; do not block code completion if Shell not available.

## Acceptance

- [ ] Cross-mon tile under pointer is a valid drop target for hit + paint
- [ ] No sticky previews when leaving mon
- [ ] Tests green (unit)
- [ ] Plan status complete; residual live smoke listed as optional operator check
- [ ] Local commit; no push

## Hints

- `drag-drop.js` nodeWinAtPointer / sortedWindows / monitor filtering
- Recent cross-mon work may already partially exist — wire fully to D0 zones
- Failsafe clear already in D1–D3
