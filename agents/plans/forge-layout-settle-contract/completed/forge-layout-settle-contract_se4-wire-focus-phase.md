# forge-layout-settle-contract_se4-wire-focus-phase — SE4 focus phase wire

**Status:** done  
**Plan:** forge-layout-settle-contract  
**Branch:** plan/forge-layout-cold-topology  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Wire focus phase: hard-ready → apply once → soft barrier → post-settled verify once.

## Acceptance

- [x] `_layout_final_focus_pass` uses SE2 hard-ready + SE3 soft barrier
- [x] Fixed stable poll / fixed verify quiet no longer product path
- [x] Optional `FORGE_LAYOUT_FINAL_FOCUS_REASSERT_MS` still debug-only
- [x] apply_log keys: `finalFocusSettle`, `finalFocus`, `finalFocusSoft`, `finalFocusVerify`

## Context for the next agent

- Product path is soft barrier + one post-settled verify
- Persist heuristics → SE7
- Extension half → SE5 (D018 pin keep/tighten)
- Live CT3 → SE8 after SE5/SE7 as needed

## Session note

**2026-08-09:** Done with SE3 wire.
