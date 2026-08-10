# forge-nested-isolation_n4-docs — Nest process docs (D022)

**Status:** ready (partial — process rules landed 2026-08-10 with D022 handoff)  
**Plan:** [forge-nested-isolation](../plans/forge-nested-isolation.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-10  

## Goal

Agent-facing docs match D022 so campaigns stop defaulting to dual-mon nest and
logout loops.

## Acceptance

- [x] `agents/testing.md` § Wayland: nest when / not when; default mon=1;
      multi-mon only for multi-mon cases
- [x] `agents/plans/forge-wayland-rc-test-suite.md`: dual nest only for dual cases
- [x] HANDOFF / PRIORITY locks for D022 implement order
- [ ] Re-sync after N3/N1 ship (document `run` / `FORGE_HOST` / data-root env)
- [ ] Auto-cleanup pointer once N3 API exists

## Context for the next agent

- Design lock: D0 completed task + D022
- Finish residual bullets when N3/N1 land (do not re-open process rules)

## Session note

Created 2026-08-10 after D022. Partial docs shipped with priority handoff.
