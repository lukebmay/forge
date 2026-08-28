# forge-layout-enable-open-miss

**Verdict:** close
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-layout-enable-open-miss.md

## Stated status
agent done — needs tip load + host verify

## Leftovers
- Soft host: `layout:dev` after disable→enable / partial desk (one Ghostty)
  must emit skeleton then spawns, not instant `open-miss`
- No remaining implement

## Why this verdict
Agent-done + host verify only. `needOpenSkeleton` / `skipWindowStructure`
already in `lib/shared/layout-plan.js` (`planReconcile`). Not a live
duck-tape plan. Soft verify is not P0. Import the partial-desk skeleton
policy onto the kernel layout/apply surface (Absorb).

## Destination
archive → `agents/plans/archived/completed/forge-layout-enable-open-miss.md`

## Absorb
- `planReconcile` `needOpenSkeleton`: opens + no PH + not thrashed + no
  existing tab/stack groups (not only `coldEmpty`)
- `skipWindowStructure` when `needOpenSkeleton` (skeleton owns topology)
- PlaceNext dest-failure huntability (`Logger.warn`)
- L0: partial-desk skeleton; extra-copy still `ensure_layout`
