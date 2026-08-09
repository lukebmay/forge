# forge-layout-settle-contract_se1-heuristics-store — SE1 heuristics store

**Status:** done  
**Plan:** forge-layout-settle-contract  
**Branch:** plan/forge-layout-cold-topology  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Pure file-backed settle heuristics: schema, read/write, host+class+kind keys, rolling last-10, pad/clamp helpers + unit tests.

## Acceptance

- [x] `scripts/forge/settle_heuristics.py` (pure; no DBus)
- [x] Path `config_root/config/settle-heuristics.json` schema v1
- [x] Keys `host|class|processKind|residualKind` (no personal roles)
- [x] Rolling last-10 residual-positive latencies; zero residual does not push 0
- [x] Soft timeout = max×1.25 floored/clamped; first-ever = learning trial cap
- [x] `tests/unit/cli/test_settle_heuristics.py` green (18)

## Context for the next agent

- **Module:** `scripts/forge/settle_heuristics.py`
- **API:** `load_store` / `save_store` / `make_key` / `soft_timeout_for_key` / `record_trial` / `record_and_soft_timeout` / `HARD_TIMEOUT_MS`
- **Process kinds:** `open` | `move` | `focus-phase`
- **Residual kinds:** `focus` | `geom`
- **Not wired yet:** SE2 hard-ready barrier; SE3 soft barrier; SE4 layout open path; SE7 end-of-layout persist
- **JS thrash catalog** still session memory only; SE6 folds geom into this file
- Tests: `python3 -m pytest tests/unit/cli/test_settle_heuristics.py -v`

## Session note

**2026-08-09:** SE1 pure store + tests only. No layout_apply wire.
