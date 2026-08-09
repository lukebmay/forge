# forge-layout-clean-empty_ce1-detect — Empty tiles object is reconcile mode

**Status:** ready  
**Plan:** [forge-layout-clean-empty](../plans/forge-layout-clean-empty.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Make `{"tiles": [], "description": "…"}` a valid empty reconcile profile so
`forge layout clean` closes residual windows on the current workspace.

## Acceptance

- [ ] `detect_layout_mode({"tiles": []})` → `reconcile` (also with description only extras)
- [ ] `detect_layout_mode([])` still reconcile
- [ ] `forge layout show clean` succeeds on host profile with empty tiles object
- [ ] `forge layout clean --dry-run` on a non-empty desk plans close/park residuals (default close)
- [ ] Live X11: `forge layout clean` empties tiled apps (Guake only if ignore/keep-floats policy says so)
- [ ] Unit covers empty object + bare array; no name-special-case for `clean`

## Context for the next agent (complete + succinct)

- **Bug:** `scripts/forge/layout_apply.py` `detect_layout_mode` — `has_tiles` requires
  `len(tiles) > 0`, so save-with-description empty desk is rejected before plan.
- **Validate already works:** `validate_reconcile_profile({"tiles": []}, mon_count=2)`
  → empty roles, empty mon children.
- **Host file:** `$FORGE_LAYOUT_DIR/hosts/black/clean.json` =
  `{"tiles": [], "description": "No apps open, clean workspace."}`
- **Repro:** `forge layout clean` / `forge layout show clean`
- **Fix shape:** treat `tiles` key present as reconcile sugar even when empty list/dict;
  optional: empty `roles: []` + version 2.
- **Live:** agent in Guake can run clean without killing agent terminal if Guake is
  FLOAT and either not closed or ignored — verify product policy after fix.

## Session note

2026-08-09: Root-caused without code change; task ready for CE1 implement.
