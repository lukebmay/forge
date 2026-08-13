# forge-layout-first-apply-float — first `forge layout` leaves FLOAT

**Status:** done (tip smoke)
**Plan:** (none) — R024 residual
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

Operator: **same issue persists** — `forge layout dev` starts **all**
windows in FLOAT, then a second `forge layout dev` tiles them.

R024 claimed to fix this (RunSteps always force-paint; batch end
`processFloats` + force; `renderTree(force)` cancels stale idle).
Either tip is not loaded, or the fix is incomplete.

## Acceptance

- [x] Named phase that still fails: **host-not-on-tip** (pre-logout). On
      tip: one apply ends TILE
- [x] If host Shell is not on tip: said so; did **not** re-patch R024
- [x] Remaining skip on tip: **not proven**. `shouldCommit` still gates
      batch-end `commitLayout`; do not close that hole unless FLOAT
      returns
- [x] One `forge layout dev` on tip ends with TILE modes — second call
      not required

## Context for the next agent (complete + succinct)

### Proven

- R024 shipped 2026-08-13. Guard:
  `tests/regression/bug-r021-r024-open-drop-layout.test.js` R024
  section. Live: `L1.r024-first-layout-tiles`.
- Pre-logout (2026-08-13 15:28): host JS stale. `layout dev` Mode A
  `layoutBatchEnd committed: false`, follow-up place `not found`, then
  Mode B second apply “ok.”
- Post-logout host tip `v49-90-beta.2-302-g7b9875e` = `git HEAD`.
  Job `20260813T223825Z-3eac8f`: Mode A, opened 7, hard-ready timed
  out (“moving anyway”), **ok**. `forge tree`: all WINDOW `TILE`.
- Hard-ready 7/7 timeout is a known degraded path (R006), not this
  FLOAT class. Do not treat it as a reason to re-patch R024.

### Hygiene left (not this bug)

`endOpenLayoutBatch` still skips `commitLayout` when
`step.shouldCommit` is false (comment says always force). Only
revisit if FLOAT returns after a one-shot apply on tip.

## Session note

**2026-08-13 tip smoke:** host on tip. One `layout dev` TILE. Do not
re-patch R024. Zoom / R025–R027 JS also on host; live gestures still
operator.
