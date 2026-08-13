# forge-tab-click-slot — tab click shows wrong size (R025)

**Status:** ready (L0 green; live after host logout)
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

Clicking a TABBED/STACKED tab reveals that window at the **group slot**,
not leftover FLOAT / pre-group geometry.

## Acceptance

- [x] `revealGroupChild` calls `reassertNodeToSlot` on the revealed child
- [x] Reassert runs **before** raise
- [x] `afterFocus` / `updateTabbedFocus` still do **not** reassert
- [x] Zoomed windows skip reassert (D030)
- [x] No `renderTree("focus")`
- [ ] Live: after host tip, click a non-open tab — slot size, no ¼-height
      Chrome reflow on the already-visible sibling

## Session note

2026-08-13: not part of Wave Z. Root was D025 raise-only. Intra-tab
thrash (2026-08-06) correctly pulled reassert off `afterFocus`; tab
**switch** still needed one slot paint. Extends `revealGroupChild`.
