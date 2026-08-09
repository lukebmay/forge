# forge-ai-live-test-matrix_at0-capability — Capability probe + suite map

**Status:** done  
**Plan:** [forge-ai-live-test-matrix](../plans/forge-ai-live-test-matrix.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Implement capability probe, case catalog, intelligent selection, and CLI so
agents run the right live cases for current work.

## Acceptance

- [x] Probe: session, agent (guake preferred), can_hup, can_true_cold, extension ver
- [x] Catalog with L1/L2 cases tagged by behaviors + R0xx
- [x] Select by suite / behaviors / tags / from-work
- [x] Refuse true cold when agent is tiled ghostty
- [x] `forge test live probe|list|plan|run`
- [x] Unit tests pure (13+)
- [x] HANDOFF / PRIORITY / REGRESSIONS / plan cross-linked

## Session note

2026-08-09: Shipped `live_matrix.py` + `forge test live`. Guake preferred as
agent for true_cold even when focus is Chrome. AT2 remains for finer L1 setup.
