# Task: WS0 — Claim/plan scope to one workspace

**Status:** ready  
**Plan:** [forge-layout-workspace-scope.md](../plans/forge-layout-workspace-scope.md)  
**Branch:** `plan/forge-layout-workspace-scope`  
**Priority:** P0  
**Created:** 2026-08-06  

## Goal

Layout plan must only see and mutate **one target workspace**. Windows on other
workspaces are not candidates for claim, keep, park, or structure.

## Acceptance

1. Dual-ws forest fixture: role match exists only on ws2 → plan for ws1 **opens**
   (or reports missing), does **not** move/claim the ws2 window.
2. Dual-ws: Inkscape (or any non-role) only on ws2 → plan for ws1 does not list it
   kept/parked/moved.
3. Apply steps only target `mo*ws{target}` paths (default target = current when
   wired; for WS0 unit tests pass explicit workspace index).
4. Existing layout unit tests green; no regression of mon L→R bare bind.
5. Do not implement full multi-name CLI yet (WS2) — single-target API is enough.

## Likely paths

- `scripts/forge/layout_plan.py` — window walk, claim, residuals
- `scripts/forge/layout_apply.py` — `slot_to_monitor_path(..., workspace=)`
- Tree/window list from GetTree (`moNwsW` ids)

## Out of scope

- CLI multi-layout grammar (WS2)
- `--collect`
- Tab drag / peel geometry

## Session note

(ready — not started)
