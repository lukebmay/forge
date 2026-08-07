# Task: forge-settle-learning_sl2-batch-dump

**Status:** ready  
**Priority:** mid  
**Plan:** [forge-settle-learning.md](../plans/forge-settle-learning.md)  
**Branch:** `plan/forge-settle-learning`  
**Created:** 2026-08-06  

## Goal

Close the **layout-batch data hole** (CL8 deferred opens never call open-commit
settle note) and expose a **debug dump** of thrash/settle catalog so operator
can inspect after `forge layout dev` without journal archaeology.

## Why

SL1 only stamps settle pending via `_scheduleOpenCommit` (N=1 open path).
`forge layout dev` uses LayoutBatch + deferred hidden opens → residual TILE —
those windows never enter `_settlePending`, so we collect almost no samples on
the path that failed on Wayland.

## Acceptance

1. **Layout batch / deferred open**: when a deferred open is released (or first
   becomes TILE after batch admit), call `noteOpenPendingForSettle(meta, t0)`
   with a sensible t0 (map time if known, else release time). One sample per
   open on first per-window TILE agreement (reuse SL1 observe path).
2. **No double-note** if open-commit path also notes the same meta.
3. **Debug dump** (pick one, prefer smallest surface):
   - DBus method e.g. `GetThrashCatalog` / options on existing API returning
     `catalog.snapshot()` JSON, **or**
   - CLI `forge thrash` / `forge layout thrash` printing the same via session API.
   Document in `--help` one line.
4. **Unit tests** for: deferred release notes pending; dump/snapshot shape;
   no double sample on double-note.
5. **Optional stretch** if cheap: stamp settle pending after Move/apply for
   TILE windows (`kind: "move"` / `"apply"`). Skip if it risks scope creep —
   batch + dump is enough for SL2.
6. Ghostty seed still present. No disk persist. No topology redesign.

## Out of scope

- SL3 drop seeds  
- Fixing giant-tab / Grok open-leaf product bugs (use dump data first)

## Session note

**2026-08-06:** Filed after SL1 AGREE; residual from B — layout batch path.
