# forge-layout-settle-contract_se10-ghostty-seed — SE10 drop Ghostty minQuiet seed

**Status:** done  
**Plan:** forge-layout-settle-contract  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Drop/relax Ghostty built-in minQuiet seed when live samples support it (old SL3).

## Evidence (black X11, 2026-08-09)

`forge thrash` snapshot:

| Field | Ghostty value |
| --- | --- |
| settleMsLast / Max | ~224 / ~226 ms |
| thrashScore | 0 |
| postMapSizeChanges | 0 |
| postApplyDrift | 0 |
| seenOpens | 2 |
| prior seed | 250 ms |

Focus heuristics file: `black|com.mitchellh.ghostty|focus-phase|focus` — 20 trials, all zero residual.

## Acceptance

- [x] `GHOSTTY_MIN_QUIET_MS` / built-in minQuiet seed → **0**
- [x] `needsExtraVerify` for Ghostty **kept** (cheap thrash-class insurance)
- [x] Open path falls through to `OPEN_DEFAULT_QUIET_MS` (200) when catalog quiet is 0
- [x] Units updated

## Context for the next agent

- If Ghostty open thrash returns (size-changed storms), samples raise minQuiet via SE6 rolling store; do not reintroduce a brand seed without data.
- Optional later: demote `needsExtraVerify` sticky if thrashScore stays 0 across sessions.

## Session note

**2026-08-09:** Done with SE6. Live thrash dump was sufficient; no extra operator retest required for seed drop.
