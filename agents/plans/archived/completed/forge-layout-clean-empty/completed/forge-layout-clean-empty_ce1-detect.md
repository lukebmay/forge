# forge-layout-clean-empty_ce1-detect — Empty tiles object is reconcile mode

**Status:** completed  
**Plan:** [forge-layout-clean-empty](../../forge-layout-clean-empty.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09  
**Regression:** R009

## Goal

Make `{"tiles": [], "description": "…"}` a valid empty reconcile profile so
`forge layout clean` closes residual windows on the current workspace.

## Acceptance

- [x] `detect_layout_mode({"tiles": []})` → `reconcile` (also with description only extras)
- [x] `detect_layout_mode([])` still reconcile
- [x] `forge layout show clean` succeeds on host profile with empty tiles object
- [x] `forge layout clean --dry-run` on a non-empty desk plans close residuals
- [x] Live X11: `forge layout clean` empties tiled apps (0 windows in tree after)
- [x] Unit covers empty object + bare array + empty roles; no name-special-case for `clean`

## Context for the next agent (complete + succinct)

- **Fix:** `scripts/forge/layout_apply.py` `detect_layout_mode` — `has_tiles =
  isinstance(tiles, (list, dict))` (empty allowed); empty `roles: []` without
  steps also reconcile.
- **Units:** `tests/unit/cli/test_layout_apply.py` `TestDetectMode` (17 pass)
- **Host file:** `$FORGE_LAYOUT_DIR/hosts/black/clean.json`
- **Live:** Guake agent survived (hidden float / not in residual close set)

## Session note

2026-08-09: CE1 shipped + live clean on black X11; desk restored with `layout dev`.
