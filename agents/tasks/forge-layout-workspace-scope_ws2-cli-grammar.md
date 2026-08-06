# Task: WS2 — CLI grammar, sequential XOR static, preflight

**Status:** implemented (pending B verify)  
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

1. Parser unit tests: bare, `W:name`, `name@W`, **mixed error**, invalid W, too few ws. **✓**
2. Save rejects names containing `:` or `@`. **✓**
3. Scan existing layout dirs; fix any illegal names if found. **✓** (none)
4. Dry-run prints per-ws plan + ignored off-ws candidate count. **✓**
5. Help text documents exclusive modes + 1-based indexes. **✓**

## Out of scope

- Live multi-ws operator matrix (WS3)
- `--collect`

## Session note

**2026-08-06 WS2 (Task Force A):**

- **Pure module:** `scripts/forge/layout_cli.py` — `parse_layout_arg`,
  `classify_layout_args`, `bind_layout_targets`, `preflight_layout_run`,
  `n_workspaces_from_forest`, `window_candidate_counts`, `validate_layout_name`.
  CLI 1-based → internal 0-based.
- **CLI:** `cmd_layout` → `_layout_run_multi` all-or-nothing preflight; multi
  sequential/static apply; stop-on-first-apply-failure with report; dry-run
  candidates line; save name charset.
- **Names:** `layout_lib._normalize_profile_name` + save reject `:`/`@`.
  Scanned FORGE_LAYOUT_DIR / XDG / examples — no illegal names.
- **Help:** `cli_help.print_layout_help` + argparse description exclusive modes.
- **Tests:** `test_layout_cli.py` + lib name tests; full `tests/unit/cli` **424** green.
- **Commit:** `31b75cd`.
- **Next:** B verify → WS3 docs/live.
