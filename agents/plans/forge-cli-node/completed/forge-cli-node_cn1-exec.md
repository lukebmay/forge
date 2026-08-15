# forge-cli-node_cn1-exec — Python exec helper + job argv note

**Status:** done  
**Plan:** [forge-cli-node](../../forge-cli-node.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-14  
**Agent:** `grok-4.5` as 4.5 **medium**.

## Goal

One Python helper every later CN command uses to `exec` a
`cli/*.mjs` file. Job runner stays Python; document that worker argv
is opaque (may start with `node` later).

## Acceptance

- [x] `scripts/forge/node_exec.py` exists with:
      `find_node()`, `node_missing_message()`, `cli_mjs(rel)`,
      `exec_cli(rel, argv)` (`os.execv`), `run_cli(rel, argv)` (tests)
- [x] Missing `node` → message names the tool + install hint; callers
      can exit **127** (`scripting.md`)
- [x] `cli_mjs("keybind.mjs")` resolves to
      `<repo>/cli/keybind.mjs` (file need not exist yet)
- [x] `tests/unit/cli/test_node_exec.py` covers missing node, path
      resolve, `run_cli` against `cli/smoke-import.mjs`
- [x] `job_runner.forge_worker_argv` docstring: worker may be Node;
      argv is opaque
- [x] One pytest: `spawn_worker` with argv starting `"node"` does
      **not** prepend `sys.executable` (mock Popen)
- [x] Production `forge` worker argv **unchanged**
- [x] `test_job_runner.py` still green

## Context for the next agent (complete + succinct)

### Landed

| Path | Role |
| --- | --- |
| `scripts/forge/node_exec.py` | `find_node`, `node_missing_message`, `cli_mjs`, `exec_cli` (`os.execv`), `run_cli` (tests); missing node → stderr + **127** |
| `tests/unit/cli/test_node_exec.py` | missing node, path resolve, smoke `run_cli`, execv argv shape |
| `job_runner.forge_worker_argv` | docstring: opaque argv; Node workers later |
| `test_job_runner.test_spawn_worker_node_argv_opaque` | mock Popen; `["node", …]` not rewritten |

### Dispatch contract (do not invent another)

`os.execv(node, [node, <repo>/cli/<file>.mjs, *cmd_argv])`. Inherit
env/stdio/cwd. Prefer exec so job workers do not leave a Python
parent.

Do **not** pass `--input-type=module` for `.mjs`.

### Test

```bash
python3 -m pytest tests/unit/cli/test_node_exec.py \
  tests/unit/cli/test_job_runner.py -q
```

### Do not (still)

- Exec any user command yet (no `forge keybind` shim) — **CN2**
- Change `maybe_run_as_job` production argv in `scripts/forge/forge`

## Session note

**2026-08-14:** CN1 done. `node_exec.py` + unit tests; job_runner
docstring + opaque-node spawn test. 45 pytest green. No user-facing
exec shim. Next: CN2 (`forge keybind`).
