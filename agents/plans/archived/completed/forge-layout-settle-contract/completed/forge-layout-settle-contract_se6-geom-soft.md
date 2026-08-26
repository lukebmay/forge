# forge-layout-settle-contract_se6-geom-soft — SE6 geom soft fold

**Status:** done  
**Plan:** forge-layout-settle-contract  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Fold SL1 geom / minQuiet into the same settle-heuristics store (no second file).
Session I/O: load once, accumulate in memory, write only after top-level layout.

## Acceptance

- [x] `HeuristicsSession` — load once, dirty flag, flush when dirty
- [x] CLI focus residual records via session (no mid-pass save)
- [x] Flush once at end of `_layout_run_reconcile` apply (`settleHeuristicsFlush`)
- [x] Geom soft barrier after residual/belt moves (`followUpGeomSoft` / `beltGeomSoft`)
- [x] Extension catalog: D019 pad 1.25 / clamp 5s; rolling latencies; seed from file once
- [x] Units: session, geom barrier, thrash catalog SE6/SE10

## Context for the next agent

- **Session API:** `settle_heuristics.HeuristicsSession` / `default_session()` / `flush()`
- **Geom barrier:** `layout_apply.run_soft_geom_barrier` + `resolve_geom_soft_timeout_ms`
- **First-ever geom wait:** capped at `GEOM_FIRST_EVER_OBSERVE_MS` (500) on post-move path
- **Extension seed:** `AppThrashCatalog.applySettleHeuristicsStore` from file at WM init (read only)
- **Durable writer:** CLI layout apply only (not extension open path)
- Tests: `test_settle_heuristics.py`, `TestSoftGeomBarrierSe6`, `app-thrash-catalog.test.js`

## Session note

**2026-08-09:** SE6 + SE10 shipped together. Operator I/O rule: no per-subroutine
disk spam; rolling last-10 stays small in memory.
