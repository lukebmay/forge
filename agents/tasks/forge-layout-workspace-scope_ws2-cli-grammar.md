# Task: WS2 — CLI grammar, sequential XOR static, preflight

**Status:** ready  
**Plan:** [forge-layout-workspace-scope.md](../plans/forge-layout-workspace-scope.md)  
**Branch:** `plan/forge-layout-workspace-scope`  
**Depends on:** WS0, WS1  
**Created:** 2026-08-06  

## Goal

Parse and validate multi-layout args; **exclusive** sequential vs static modes;
all-or-nothing preflight; forbid `:` / `@` in layout **names** on save.

## Grammar (locked)

| Mode | Args | Behavior |
| --- | --- | --- |
| **Sequential** | Only bare `name`… | current, current+1, … |
| **Static** | Only `W:name` and/or `name@W`… | explicit 1-based workspaces |

**Mix = error, apply nothing.** No pins with sequential. No `--on`.

```text
forge layout dev                              # sequential, current
forge layout vinyl-graphics video-edit        # sequential from current
forge layout 1:foo 2:bar 4:baz                # static
forge layout foo@1 bar@2                      # static (equiv)
forge layout dev 3:vinyl                      # ERROR mixed
```

## Preflight (no partial apply)

1. Mode classification: all bare | all numbered | mixed → fail.
2. Every profile exists.
3. Every workspace in range (static) or sequential span fits (bare).
4. Else error and **apply nothing**.

## Acceptance

1. Parser unit tests: bare, `W:name`, `name@W`, **mixed error**, invalid W, too few ws.
2. Save rejects names containing `:` or `@`.
3. Scan existing layout dirs; fix any illegal names if found.
4. Dry-run prints per-ws plan + ignored off-ws candidate count.
5. Help text documents exclusive modes + 1-based indexes.

## Out of scope

- Live multi-ws operator matrix (WS3)
- `--collect`

## Session note

(ready — not started)
