# forge-ai-live-test-matrix_at2-l1-setup — Precise L1 setup steps

**Status:** done  
**Plan:** [forge-ai-live-test-matrix](../../forge-ai-live-test-matrix.md)  
**Branch:** master  
**Updated:** 2026-08-09

## Goal

v1 `run` approximated mon0/mon1 chrome close with full chrome close. Tighten:

- `close-mon0-chrome` / `close-mon1-chrome` by monitor index
- `ensure-nautilus` for t1 case
- `ensure-dev-shape` optional no-op if already shaped

## Acceptance

- [x] Per-mon chrome close uses tree mon index
- [x] t1 case can open nautilus if missing
- [x] Docs note remaining coarseness if any

## Context for the next agent (complete + succinct)

- Pure: `select_chrome_tile_ids`, `forest_has_nautilus`, `forest_looks_like_dev_shape`, `forest_has_some_tiles` in `scripts/forge/live_matrix.py`
- Runner: `_test_live_close_chrome(mon_index=)`, `_test_live_ensure_nautilus`, `_test_live_ensure_dev_shape`, `_test_live_ensure_some_tiles` in `scripts/forge/forge`
- Units: `tests/unit/cli/test_live_matrix.py` (`TestSetupSelectors`)
- Remaining: shape = structural heuristic; Guake-hidden still may omit agent from tree
- Declarative keeps (`keep-agent`, …) unchanged — not close actions

## Session note

2026-08-09: AT2 shipped. Mon chrome close no longer closes the other mon’s chrome. Nautilus / dev-shape / some-tiles ensures real. 19 unit tests green.
