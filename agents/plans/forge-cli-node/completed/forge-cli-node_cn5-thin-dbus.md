# forge-cli-node_cn5-thin-dbus — Thin DBus verbs

**Status:** done  
**Plan:** [forge-cli-node](../../forge-cli-node.md) §CN5  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-14  
**Agent:** `grok-4.5` as 4.5 **medium**.

## Goal

Port thin session-bus verbs to Node using CN4 `cli/dbus.mjs`:
`focus`, `swap`, `move`, `get`, `set`, `settings save|load`.
Python handlers become `exec_cli` shims only. Selectors stay strings;
do not port `tile-select.js`.

## Acceptance

- [x] Node bodies under `cli/` (one or more `.mjs`; match CN4 style)
- [x] `--first` for focus/swap/move matches Python `_with_first`
- [x] `get`/`set`/`settings` argv + exit + JSON match current CLI
- [x] Python `cmd_*` are shims; cmds in `_NO_DBUS_COMMANDS`
- [x] Vitest: flag/parse + mock `callMethod` / `run`
- [x] Pytest shim tests (extend pattern from `test_ping_tree_shim.py`)
- [x] No `dbus-next` / new npm deps
- [x] Do **not** drop Python `gi` backend
- [x] `python3 -m pytest tests/unit/cli/test_forge_class_eq.py -q` still green
- [x] Live (if extension up): `forge get tiling-mode-enabled` etc.

## Context for the next agent (complete + succinct)

### Landed

| Path | Role |
| --- | --- |
| `cli/cmd-result.mjs` | `withFirst` + `cmdResult` (Python `_with_first` / `_cmd_result`) |
| `cli/focus.mjs` `swap.mjs` `move.mjs` | selectors + `--first` → Focus/Swap/Move |
| `cli/get.mjs` `set.mjs` `settings.mjs` | GetSetting / SetSetting / SettingsSave\|Load |
| `scripts/forge/forge` | `cmd_*` → `exec_cli`; cmds in `_NO_DBUS_COMMANDS` |
| `tests/unit/cli/cmd-result.test.js` + per-cmd tests | parse + mock gdbus |
| `tests/unit/cli/test_cn5_shim.py` | exec_cli argv + NO_DBUS |

### Dispatch

```text
forge focus 'wm:foo' --first
  → exec_cli("focus.mjs", ["wm:foo", "--first"])
  → withFirst → Focus(json) → pretty JSON / exit from ok|error

forge set key hello world
  → set.mjs joins value tokens → SetSetting(key, "hello world")

forge settings save myname
  → settings.mjs → SettingsSave("myname")
```

Python `_with_first` / `_cmd_result` **kept** (run-steps / thrash still use them).

### Test

```bash
npm test -- tests/unit/cli/
python3 -m pytest tests/unit/cli/test_cn5_shim.py \
  tests/unit/cli/test_ping_tree_shim.py \
  tests/unit/cli/test_node_exec.py \
  tests/unit/cli/test_forge_class_eq.py -q
# live: forge get tiling-mode-enabled
```

### Do not (still)

- Port launch / run-steps (CN6)
- Port layout / job_runner
- Add npm deps / dbus-next
- Drop Python gi

## Session note

**2026-08-14:** CN5 done. Shared `cli/cmd-result.mjs` + six command
`.mjs` files; Python shims + `_NO_DBUS_COMMANDS`. Vitest **94 PASS**
(cli suite); pytest CN5/shim/node_exec/class_eq **38 PASS**. Live:
`forge get tiling-mode-enabled` → ok/value true. Next: **CN6** launch +
run-steps.
