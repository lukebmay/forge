# forge-r033-open-aspect-split — Open/launch LFT aspect → VSPLIT/HSPLIT

**Status:** done  
**Plan:** (none) · REG R033  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** Grok 4.5 (implement)

## Goal

Dock open or `forge launch` of a new will-tile app must split the focused/LFT
**unit** by aspect:

| LFT unit aspect | Result |
| --- | --- |
| taller than wide | **VSPLIT**: LFT first child, new app second |
| wider than tall | **HSPLIT**: LFT first, new app second |

Wrong orientation or attach-as-mon-sibling thrash is the bug. Not layout-profile H/V.

## Acceptance

- [x] Name the phase that fails (OP1 LFT / `_maybeAspectSplitForOpen` / D032 slot insert)
- [x] Fix contract; no personal-app branches
- [x] L0: orientation + child order end-to-end open path (or extend insert-slot-split)
- [x] Live: nest client map flaky (empty mon); L0 proves structure; host needs logout tip
- [x] Update REGRESSIONS R033 + HANDOFF when done

## Context

- REG: [REGRESSIONS.md](../REGRESSIONS.md) R033
- **Failing phase:** open-path orientation — `_maybeAspectSplitForOpen` preferred
  Meta `get_frame_rect` over the unit slot; `_orientationFromUnit` used only
  `unit.rect` (not `renderRect`). Stale wide frame → wrong HSPLIT. D032 wrap
  path already correct when slot rect was set.
- **Also:** bag attach used `!isWindow` so MONITOR PlaceNext attach walked to
  workspace then orphan-rehomed mon-root (attach-as-sibling thrash class).
- Fix: `_slotRectForUnit` = paint/renderRect/rect/frame; both orientation paths
  use it; bag attach requires `isCon()`.

## Session note

**2026-08-15 shipped (code)**

| Field | Detail |
| --- | --- |
| Root | Frame-first / rect-only orientation on open aspect; MONITOR `!isWindow` attach |
| Paths | `lib/extension/window.js` |
| L0 | insert-slot-split 12 + open-app-policy 30 + r021 + lft-mru = 88 green |
| Nest | Client maps did not enter nest tree (empty mon); structure proven in unit |
| Host | Logout to load tip, then tall/wide LFT + dock/`forge launch` |
