# forge-ai-live-test-matrix_at2-l1-setup — Precise L1 setup steps

**Status:** ready  
**Plan:** [forge-ai-live-test-matrix](../plans/forge-ai-live-test-matrix.md)  
**Branch:** master  
**Updated:** 2026-08-09

## Goal

v1 `run` approximates mon0/mon1 chrome close with full chrome close. Tighten:

- `close-mon0-chrome` / `close-mon1-chrome` by monitor index
- `ensure-nautilus` for t1 case
- `ensure-dev-shape` optional no-op if already shaped

## Acceptance

- [ ] Per-mon chrome close uses tree mon index
- [ ] t1 case can open nautilus if missing
- [ ] Docs note remaining coarseness if any

## Context

- Runner: `cmd_test` in `scripts/forge/forge`
- Pure catalog: `scripts/forge/live_matrix.py` LIVE_CASES setup tuples
