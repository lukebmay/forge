# forge-layout-settle-contract_se7-persist-docs — SE7 persist + docs

**Status:** done  
**Plan:** forge-layout-settle-contract  
**Branch:** plan/forge-layout-cold-topology  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Persist heuristics end-of-focus; document settle path; REGRESSIONS R006.

## Acceptance

- [x] `save_settle_heuristics` after soft-barrier samples in `_layout_final_focus_pass`
- [x] `docs/user/layout.md` cold focus phase steps
- [x] `docs/DESIGN.md` open-then-place step 6
- [x] REGRESSIONS R006

## Context for the next agent

- Path: `~/.config/forge/config/settle-heuristics.json`
- apply_log `finalFocusHeuristics.persist` = ok|error
- **Next:** SE5 extension pin; SE8/CT3 X11 cold smoke

## Session note

**2026-08-09:** SE7 with SE3/SE4 wire.
