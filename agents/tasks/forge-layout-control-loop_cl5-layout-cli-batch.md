# Task: forge-layout-control-loop_cl5-layout-cli-batch

**Status:** ready  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05

## Goal

Align **layout CLI / multi-open** with the control-loop commit+verify path: no
per-app mid-batch `renderTree` flood; one plan + one (debounced) layout after
batch quiet; verify after. LF6 fingerprint wait becomes batch quiet, not a
separate philosophy.

## Acceptance

1. Identify current layout apply / multi-open render call sites (Python CLI +
   GJS DBus / session-api / run-steps as applicable). Document in session note
   which paths still force mid-batch render.
2. Multi-window open/apply batch:
   - Prefer freeze mid-batch if already used
   - Single `requestLayout` / single `renderTree` after admits+quiet (or residual
     once)
   - Post-render verify already exists (CL0/CL1)
3. Where layout CLI already waits for fingerprint stability (LF6), keep that as
   **batch quiet** gate; then one commit+verify — do not re-render per role open
   mid-batch.
4. Unit/integration tests where feasible:
   - Coalesce: N layout requests during batch → one fire (layout-controller already)
   - If GJS layout apply path is unit-testable: assert freeze + one render after
   - Python layout tests still green (`tests/unit/cli/`)
5. **`npm test`** + relevant `pytest` for layout CLI green.
6. No soft-rehome rename. No live Ghostty required (CL7).

## Out of scope

- CL6 debug gsetting periodic verify (can be tiny follow-up)
- CL7 operator live smoke on black

## Implementation hints

- Grep: `renderTree`, `window-create`, layout apply, freezeRender, run-steps,
  session-api layout, `scripts/forge` layout.
- Prefer minimal glue: if layout CLI already freezes and single-renders at end,
  document + add test; only change if mid-batch renders remain.

## Session note

(ready — not started)

**Git:** Stay on `plan/forge-layout-control-loop`. Leave wayland-live stash alone.
