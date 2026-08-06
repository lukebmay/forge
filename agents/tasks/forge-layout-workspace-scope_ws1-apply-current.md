# Task: WS1 — Apply path + current workspace

**Status:** ready  
**Plan:** [forge-layout-workspace-scope.md](../plans/forge-layout-workspace-scope.md)  
**Branch:** `plan/forge-layout-workspace-scope`  
**Depends on:** WS0  
**Created:** 2026-08-06  

## Goal

Stop hardcoding workspace 0 in apply. Resolve **current** workspace from the
live session; thread 0-based index through plan/apply; CLI still 1-based later.

## Acceptance

1. `slot_to_monitor_path` / open / move / ensure use target `ws` index, not only 0.
2. Extension or tree API exposes current workspace index to CLI (`forge tree`
   meta or ping/layout helper).
3. `forge layout <name>` (single) applies on **current** workspace after install.
4. Save snapshots only that workspace’s mon roots.
5. Unit tests for path building + save filter; live: layout on ws2 does not touch ws1.

## Out of scope

- Multi-name sequential CLI (WS2)
- Name charset (WS2)

## Session note

(ready — not started)
