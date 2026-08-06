# Task: WS2 — CLI grammar, sequential, preflight

**Status:** ready  
**Plan:** [forge-layout-workspace-scope.md](../plans/forge-layout-workspace-scope.md)  
**Branch:** `plan/forge-layout-workspace-scope`  
**Depends on:** WS0, WS1  
**Created:** 2026-08-06  

## Goal

Parse and validate multi-layout args; sequential from current; all-or-nothing
preflight; forbid `:` / `@` in layout **names** on save.

## Grammar (locked)

| Arg | Meaning |
| --- | --- |
| `name` | Apply on sequential cursor (starts at current; +1 after each bare) |
| `W:name` | Apply `name` on workspace W (1-based); no cursor advance |
| `name@W` | Same as `W:name` |

No `--on`. Examples:

```text
forge layout dev
forge layout vinyl-graphics video-edit
forge layout 1:foo 2:bar 4:baz
forge layout dev 3:vinyl-graphics video-edit
```

## Preflight (no partial apply)

1. Every profile exists.
2. Every explicit W in range.
3. Sequential bare names fit from current through available workspaces.
4. Else error and **apply nothing**.

## Acceptance

1. Parser unit tests for bare / `W:name` / `name@W` / mix / invalid.
2. Save rejects names containing `:` or `@`.
3. Scan existing layout dirs; fix any illegal names if found.
4. Dry-run prints per-ws plan + ignored off-ws candidate count.
5. Help text documents grammar + 1-based indexes.

## Out of scope

- Live multi-ws operator matrix (WS3)
- `--collect`

## Session note

(ready — not started)
