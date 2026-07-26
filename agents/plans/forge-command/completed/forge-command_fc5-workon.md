# Task — FC5: `forge workon` composition

**Status:** Verified (B AGREE)
**Plan:** [forge-command.md](../plans/forge-command.md)  
**Priority:** P1 (highest remaining product impact)  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-command/completed/`

## Problem

Morning setup is still multi-command glue (`gdisplays load` + several
`forge launch` + layout/focus). FC0–FC4 provide the primitives; missing is a
**named profile** that composes displays + mixed steps into one command.

## Design locks (FC5 — short pass)

| Topic | Decision |
| --- | --- |
| CLI name | **`forge workon`** — do **not** shadow shellrc `workon` (`t`/`e`) |
| Profile dir | `~/.config/forge/workon/<name>.json` |
| Schema version | `version: 1` required |
| Displays | Optional string `displays`: shell out to `gdisplays load <name>` when `gdisplays` is on PATH; if key set and binary missing → hard error with install hint |
| Settings | Optional string `settings`: existing `SettingsLoad` profile name |
| Steps | Same ops as FC4 + CLI-only `launch` / `wait-window` / `wait` |
| Orchestration | **CLI-side only** — partition mixed steps; extension chunks → DBus `RunSteps`; no new DBus method |
| `forge run` | Accept mixed scripts (same orchestrator); drop “refuse CLI-only” for `run` / `run-steps` when payload is mixed **or** keep `run-steps` pure-extension and make `run` + `workon` the mixed path. **Prefer:** `run` and `workon` mixed; `run-steps` stays extension-only (clearer). |
| freezeRender | Unchanged — each extension chunk is one RunSteps (one freeze/render) |
| stopOnError | Default true (profile + steps) |
| Ambiguity | Reuse `--first` / step fields; no interactive picker |
| Example profile | Ship docs example only under `docs/` or `scripts/forge/examples/` — not auto-installed into `~/.config` |

### Profile schema v1

```json
{
  "version": 1,
  "description": "optional human blurb",
  "displays": "rec",
  "settings": "optional-config-sync-name",
  "stopOnError": true,
  "steps": [
    {
      "op": "launch",
      "app": "ghostty",
      "monitor": "0",
      "wmClass": "optional",
      "treePath": "optional",
      "timeout": 15000,
      "noWait": false
    },
    { "op": "wait", "ms": 200 },
    { "op": "layout", "mode": "tabbed", "selector": "class:com.mitchellh.ghostty" },
    { "op": "focus", "selector": "class:com.mitchellh.ghostty" }
  ]
}
```

### CLI surface

```text
forge workon <name>              # run profile
forge workon list                # names (+ description if present)
forge workon show <name>         # print resolved JSON / path
forge run <file.json>            # mixed steps file (upgrade from FC4)
```

`forge run-steps` remains **extension-only** (reject launch/wait) so scripts
that only batch tree ops stay honest.

### Execution order

1. Load + validate profile  
2. If `displays` → `gdisplays load <name>` (fail → exit non-zero unless later soft flag; MVP hard)  
3. If `settings` → SettingsLoad  
4. Partition steps (mirror `partitionMixedSteps` logic in Python)  
5. For each chunk: CLI ops sequentially; extension ops as one `RunSteps`  
6. Aggregate results JSON; exit 1 on failure when stopOnError

### Launch step field map → existing `forge launch`

| Step field | CLI flag / behavior |
| --- | --- |
| `app` / `desktop` / `command` | positional app |
| `monitor` | `--monitor` |
| `treePath` / `path` | `--tree-path` |
| `wmClass` / `wm_class` | `--wm-class` |
| `timeout` / `timeoutMs` | `--timeout` |
| `noWait` / `no_wait` | `--no-wait` |
| `first` | `--first` |

### Non-goals (FC5)

- Full declarative tree compiler / i3 layout restore  
- Recording GUI / auto-capture profile from live tree  
- Disk session-layout as workon (session-layout stays HUP path)  
- Overwriting shellrc `workon`  
- gdisplays v2 features inside this repo  

## Goals

1. Profile load/validate helpers (pure, unit-tested — Python or small extracted module)  
2. Mixed-step orchestrator used by `forge workon` and `forge run`  
3. `forge workon list|show|<name>`  
4. Example profile + DESIGN.md section + README  
5. `npm test` still green (no regression); pure helper tests for new code  
6. Plan/task notes; **no commit** unless user asks  

## Code touch list (expected)

| Area | Notes |
| --- | --- |
| `scripts/forge/forge` | workon + mixed `run` orchestrator |
| optional pure module | e.g. `scripts/forge/workon_lib.py` or in-file pure funcs |
| Tests | pure profile/partition tests (pytest or vitest-mirrored JS only if reused); prefer Python unit tests runnable without Shell |
| `docs/DESIGN.md` | FC5 section |
| `scripts/forge/README.md` | workon docs |
| example | `scripts/forge/examples/workon-dev.json` (or similar) |

## Acceptance

- [x] Profile schema v1 validated; clear errors for bad version / missing steps  
- [x] `forge workon <name>` runs displays → settings → mixed steps  
- [x] `list` / `show` work offline for list (show may only need disk)  
- [x] `forge run <mixed.json>` executes launch + extension ops  
- [x] `forge run-steps` still rejects CLI-only ops  
- [x] Missing `gdisplays` when `displays` set → exit ≠ 0 + install hint  
- [x] stopOnError stops at first failed step/chunk  
- [x] DESIGN + README + example  
- [x] `npm test` green  
- [x] No new DBus API required  

## Out of scope

- Live install smoke on dual-head (nice if easy; not blocking)  
- Auto-migrating old shell scripts  
- Personal-fork / audit B1  

## Session note

**B AGREE (no commit). FC5 acceptance met.**

### Verify results
1. `python3 tests/unit/cli/test_workon_lib.py -v` → **23 OK**
2. `npm test` → **1868 passed** (184 files)
3. `run-steps` + launch/wait → exit 1, CLI-only reject message
4. `HOME=… PATH=/usr/bin:/bin workon` with `displays` → **exit 127** + `install-gdisplays` hint
5. `workon list` / `show` offline OK; missing name → nonzero
6. Diff: CLI + pure helpers + docs only — **no** lib/session-api / new DBus methods

### Acceptance (honest)
All boxes stand: schema v1, list/show offline, mixed `run` + workon orchestrator,
`run-steps` extension-only, gdisplays hard-fail, stopOnError in `run_mixed_steps`,
DESIGN/README/example, npm green, no new DBus.

### Findings (none blocking)
1. **nit** — `main` always `_check_deps()` for `workon <name>` even displays-only empty steps
2. **nit** — `list` includes invalid schema names; `show`/`run` still reject
3. **nit** — README `forge run` on example profile ignores `displays`/`settings` (by design)
4. **minor** — bad launch/wait-window `timeout` can raise uncaught `int()` ValueError

### Residuals
- Live dual-head morning smoke not run (out of scope)

