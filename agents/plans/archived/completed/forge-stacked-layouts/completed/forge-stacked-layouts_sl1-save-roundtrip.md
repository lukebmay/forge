# Task: SL1 — stacked profile IR + save round-trip

**Status:** done  
**Plan:** [forge-stacked-layouts.md](../../forge-stacked-layouts.md)  
**Depends:** SL0 done

## Problem

`layout save` serializes both TABBED and STACKED multi-window groups as a bare
multi-cell array (`["a","b"]`). Desugar always makes multi-role panes
**tabbed** — so STACKED never round-trips.

## Design (implement this)

### Save (`layout_save.py` `_capture_pane`)

| Live layout | Multi-window emit |
| --- | --- |
| **TABBED** | bare list `cells` (unchanged) |
| **STACKED** | `{"layout": "stacked", "content": cells}` (string/object cells as today) |

Single-window stack/tab still collapses to one cell.

### Desugar (`layout_plan.py`)

1. `_desugar_role_pane(..., mode: str = "tabbed")` — multi-role sets `layout` to `mode` (`tabbed` \| `stacked`).
2. In `_desugar_pane`, **before** generic nested-split handling: if dict has
   `layout` or `split` in (`tabbed`,`stacked`) and `content`/`children` is a
   list of **only role cells** → `_desugar_role_pane(..., mode=that)`.
3. Bare multi-cell arrays remain **tabbed** (no BC required but keep happy path).
4. Nested non-role content under split still uses existing CON children path.

### Modes / ensure

`_slot_layout_modes` already maps leaf `layout: "stacked"` → structure ensure.
After desugar, multi-role stacked must appear as leaf with `layout` + `roles`
(not nested single-role children under split CON).

### Tests

- Save fixture forest with STACKED CON → output has stacked object, not bare pair
- `normalize_profile` / `validate_reconcile_profile` → slot mode stacked
- Tabbed multi still bare list → tabbed
- Optional: plan structure ensure mode stacked when forest is split but profile wants stack
- Update docs lightly: `docs/user/layout.md` + `layouts.md` stacked sugar one-liner

### Non-goals

- SL2 alternate sugar syntax beyond `layout`/`split` + content
- SL3 thrash parity (unless a one-liner falls out)
- Flip stack mode default
- Live black

## Acceptance

1. STACKED group save → profile desugars to `layout: "stacked"` multi-role
2. TABBED group save still bare array / tabbed
3. Unit tests green for layout_save + layout_plan touched paths
4. Docs mention how to author stacked vs tabbed in profiles
5. Plan/task notes; next SL2 or SL3

## Session note

**2026-07-28 Task Force A**

- `layout_save._capture_pane`: STACKED multi → `{layout:stacked, content}`; TABBED bare list.
- `layout_plan`: `_desugar_role_pane(mode=)`; early desugar for layout/split tabbed|stacked + role cells only → multi-role leaf.
- Fixture `tree-stacked-pair.json`; tests in `test_layout_save` + `test_layout_plan`.
- Docs: `docs/user/layout.md` table row; `layouts.md` author/save pointer.
- pytest: 165 passed. Next: SL3 thrash parity (SL2 sugar done here).
