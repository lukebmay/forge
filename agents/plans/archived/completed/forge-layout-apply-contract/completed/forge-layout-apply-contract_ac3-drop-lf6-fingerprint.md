# Task: forge-layout-apply-contract_ac3-drop-lf6-fingerprint

**Status:** done  
**Plan:** [forge-layout-apply-contract.md](../../forge-layout-apply-contract.md)  
**Branch:** `plan/forge-layout-apply-contract`  
**Created:** 2026-08-07  
**Completed:** 2026-08-07  
**Depends:** AC2 done  
**Host:** black — unit tests only (Wayland; no live install/HUP)

## Goal

Drop **LF6 whole GetTree fingerprint quiet** as the **default** pre-place /
post-open gate for `forge layout`. Tree owns slots; place residual after role
pins without requiring global forest Meta-stable (plan §5–6, §15.2).

Keep `forest_stability_fingerprint` / `wait_for_tree_stable` as **optional
debug** (flag/env), not the product default path.

## Current behavior (kill default)

In `scripts/forge/forge` layout apply (after open map wait):

1. **Always** `wait_for_tree_stable` (LF6 batch quiet) before release-deferred + residual plan  
2. Optional **belt** second `wait_for_tree_stable` after residual when role_pins

Both encode “forest Meta-stable before/after place” — jumpiness / false coupling.

## New default

```text
open all (parallel) → map-pin wait per role (existing)
  → release-deferred (if batch)
  → residual plan + place (RunSteps / moves)
  → NO default fingerprint gate
  → belt fingerprint wait OFF by default
```

Optional: `--wait-tree-stable` (and/or env `FORGE_LAYOUT_WAIT_TREE_STABLE=1`) restores
old gate for debugging. Belt may share the same flag or stay off always unless
`--wait-tree-stable` (prefer **one flag** controlling both gates).

## Scope (in)

1. `scripts/forge/forge` (layout apply path): default skip `wait_for_tree_stable` and belt wait.  
2. CLI surface: document flag in help / layout user docs if flags are listed.  
3. Keep pure helpers in `layout_apply.py` (do not delete functions — optional path).  
4. Unit tests: default path does not call wait (inject/mock) OR document flag behavior; update any test that assumes always-wait.  
5. Docs: architecture.md / rendering.md / DESIGN snippet if they say LF6 is default batch quiet — update to optional.  
6. `layout-open.js` comment if it claims LF6 fingerprint is required.

## Out of scope

- Placeholder product (AC4)  
- Slot-math pure tests (AC5)  
- Residual nudge (AC7 — later **cancelled**)  
- Live layout smoke (AC6)  
- Changing extension open quiet admit (minQuietMs) beyond comment cleanup  
- Removing fingerprint helpers entirely  

## Acceptance

1. Default `forge layout` apply path does **not** invoke `wait_for_tree_stable` (main or belt).  
2. Optional flag/env re-enables wait for debug.  
3. Fingerprint helpers still unit-tested and available.  
4. Python unit tests green (`pytest` for layout_apply / related).  
5. JS unit suite still green if any JS comment-only / no break.  
6. Docs updated. No live HUP.  
7. Session notes on task + plan.

## FIRM

- Branch `plan/forge-layout-apply-contract`  
- No push, no SSH, no secrets  
- DESIGN-FLAW → stop  
- High reasoning  

## Session note

**2026-08-07 (A implement):** Default layout apply no longer calls
`wait_for_tree_stable` (main or belt). Opt-in: `--wait-tree-stable` and/or
`FORGE_LAYOUT_WAIT_TREE_STABLE=1` via `layout_wait_tree_stable_enabled` (one flag
gates both). Helpers kept in `layout_apply.py`. Docs/comments updated
(architecture, rendering, DESIGN, layout-open, session-api, user layout, cli_help).
Tests: `pytest tests/unit/cli/test_layout_apply.py` 77 passed; layout-open.js 19
passed. No live HUP. No commit (orchestrator).
