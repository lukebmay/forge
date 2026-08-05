# Task: forge-layout-control-loop_cl6-debug-verify-interval

**Status:** ready  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05

## Goal

Optional **debug** periodic layout verify interval gsetting (default **off** / 0).
Production stays event-driven only.

## Acceptance

1. GSettings key e.g. `layout-verify-interval-ms` (int, default **0** = off) in
   schema + settings defaults / keys list as project does for similar keys.
2. When interval > 0: GLib timeout (or equivalent) calls `requestVerify("periodic")`
   on a repeating interval; cancel/restart on setting change; cancel on disable.
3. When 0: no timer.
4. Unit tests: enable → timer scheduled (injectable); set 0 → cancel; disable clears.
5. Short docs note: debug only, default off.
6. `npm test` green (or schema-related suite).
7. No soft-rehome rename. No live black requirement.

## Session note

(ready — not started)
