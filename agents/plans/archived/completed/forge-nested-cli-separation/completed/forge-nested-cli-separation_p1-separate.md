# forge-nested-cli-separation_p1-separate — Separate Nested from user CLI

**Status:** done  
**Plan:** [forge-nested-cli-separation](../plans/forge-nested-cli-separation.md)  
**Branch:** master  
**Updated:** 2026-08-17

## Goal

Nested is not part of the everyday user Forge CLI surface; available as
**`forge test nested …`**. Nest isolation (D022) unchanged.

## Acceptance

- [x] `forge help` Commands: no Nested product row; `test` covers live + nested retest
- [x] Working: `forge test nested status|doctor|run|…`
- [x] Top-level `forge nested …` → exit 2 + migration line
- [x] Flag hoist works via rewrite + existing hoist
- [x] Makefile `nested-*` → `forge test nested …`
- [x] User troubleshooting: Wayland host tip = logout; Nested removed from first steps
- [x] CONTRIBUTING + testing/HANDOFF/PRIORITY FIRM strings updated
- [x] live_matrix / `_lib.zsh` / rebuild / migrate strings updated
- [x] nested_wayland brand strings use `forge test nested`
- [x] Units: 27 pass (normalize + hoist + refuse)
- [x] Live: `forge test nested run -- forge ping` ok; status not running after
- [x] No D022 change; no CN14

## Session note

**2026-08-17:** Implemented. Product entry `forge test nested`; hard break top-level
`nested`. L0 27 green; nest campaign ping PASS and stopped.
