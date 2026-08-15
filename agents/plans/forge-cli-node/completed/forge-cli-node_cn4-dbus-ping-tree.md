# forge-cli-node_cn4-dbus-ping-tree — DBus adapter + ping + tree

**Status:** done  
**Plan:** [forge-cli-node](../../forge-cli-node.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-14  
**Agent:** `grok-4.5` as 4.5 **medium**.

## Goal

Prove Node session-bus I/O via `gdbus` without layout/mutators. Port
`forge ping` and `forge tree` bodies to Node; Python handlers become
`exec_cli` shims only. Keep Python `gi` backend for unmigrated commands.

## Acceptance

- [x] `cli/dbus.mjs` — `gdbus call --session` to Forge; mirror
      `_METHOD_IN_ARGS`; parse GVariant-ish stdout like Python gdbus
      backend (single string JSON return)
- [x] `cli/ping.mjs`, `cli/tree.mjs` — preserve `tree --monitor=` /
      `--workspace` / `--max-depth` / `--compact` + JSON pretty-print
- [x] Python `cmd_ping` / `cmd_tree` are shims only (`exec_cli`)
- [x] Vitest: mock `run()` with fixture stdout; help works
- [x] No `dbus-next` or new npm deps
- [x] Do **not** drop Python `gi` backend
- [x] Production job worker argv unchanged
- [x] Missing `gdbus` → clear error, exit **127**

## Context for the next agent (complete + succinct)

### Landed

| Path | Role |
| --- | --- |
| `cli/dbus.mjs` | `callMethod` / `parseGdbusStdout` / `METHOD_IN_ARGS`; injectable `run`+`which` |
| `cli/ping.mjs` | Ping → pretty JSON; exit 0 iff `ok===true` |
| `cli/tree.mjs` | GetTree + filter flags; pretty/compact |
| `scripts/forge/forge` | `cmd_ping`/`cmd_tree` → `exec_cli`; ping/tree in `_NO_DBUS_COMMANDS` |
| `tests/unit/cli/dbus.test.js` | parse + argv + mock call |
| `tests/unit/cli/ping.test.js` | help / ok / missing gdbus 127 |
| `tests/unit/cli/tree.test.js` | flags / options JSON / compact |
| `tests/unit/cli/test_ping_tree_shim.py` | exec_cli argv + NO_DBUS |

### Dispatch

```text
forge ping
  → argparse help stays on Python
  → cmd_ping → exec_cli("ping.mjs", [])
  → gdbus call … Forge.Ping → parse ('{json}',) → pretty print

forge tree --monitor=0 --compact
  → exec_cli("tree.mjs", ["--monitor=0", "--compact"])
  → GetTree('{"monitor":"0"}')
```

Standalone: `node cli/ping.mjs` / `node cli/tree.mjs --help`.

### Test

```bash
npm test -- tests/unit/cli/dbus.test.js \
  tests/unit/cli/ping.test.js tests/unit/cli/tree.test.js
python3 -m pytest tests/unit/cli/test_ping_tree_shim.py \
  tests/unit/cli/test_node_exec.py -q
# live (extension up): forge ping ; forge tree --compact
```

### Do not (still)

- Drop Python `_call_gi` / unmigrated DBus cmds
- Add `dbus-next` or npm deps
- Change production job worker argv
- Port focus/swap/move (that is **CN5**)

## Session note

**2026-08-14:** CN4 done. gdbus adapter + ping/tree Node bodies;
Python shims; Vitest 35 PASS; pytest shim 5 PASS; live ping ok +
tree --compact. Next: **CN5** thin DBus verbs.
