# Task: LS1 + LS2 — bare array normalize + string-cell match inference

**Plan:** [forge-layout-sugar.md](../../forge-layout-sugar.md)  
**Status:** done (A/B AGREE)  
**Pri:** P0

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

**Done — A implement / B AGREE (2026-07-28).**

- `load_profile_file` accepts JSON object **or** bare array (`Any`).
- `normalize_profile` wraps bare list → `{tiles: …}`; `tiles` may be mon map **or** array.
- Multi-mon: ≥2 top-level mon-bodies → `mon0`…`monN`; else all panes on `mon0`.
- String inference: chrome launchers / known PWAs / Title-Case → `Google-chrome` + `title~=`; else class stem (`ghostty` ↔ reverse-DNS).
- Fixtures + unit tests; layout suite 221 OK.
- B nits only: aggressive PWA map for short tokens (non-blocking).
