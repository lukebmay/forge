# Task: LS1 + LS2 — bare array normalize + string-cell match inference

**Plan:** [forge-layout-sugar.md](../plans/forge-layout-sugar.md)  
**Status:** ready  
**Pri:** P0 next session

## Scope

1. **LS1** — Accept top-level bare JSON array as a layout profile; desugar to mon panes / tiles IR. Single-mon vs multi-mon heuristics per plan.
2. **LS2** — String cells: infer open + match from app name (desktop Name / chrome heuristics / class stem). Explicit object cells remain overrides.

## Out of scope (later tasks)

- LS3 best-effort park leftovers (can piggyback if small)
- LS4–LS5 save bare array + black rewrite
- **LS7–LS8** auto description + interactive save UX (see plan; separate task after sugar parses)

## Acceptance

- Dual-mon bare array fixture plans like current black desk shape.
- `"Grok"` / `"ghostty"` style strings claim windows without mandatory class/title in file.
- Existing `tiles.monN` profiles still work.
- Unit tests for normalize + plan.

## Session note

(overwrite when implementing)
