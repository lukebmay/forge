# forge-cli-node_cn6-launch-run-steps — launch + run / run-steps

**Status:** done  
**Plan:** [forge-cli-node](../../forge-cli-node.md) §CN6  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** `grok-4.5` as 4.5 **medium**.

## Goal

Port `forge launch`, `forge run`, and `forge run-steps` bodies to Node.
Keep Python as the PATH entry so job mutators still wrap via
`maybe_run_as_job`; the worker then execs Node for the body.

## Acceptance

- [x] Node launch: desktop resolve (`gio launch` / `gtk-launch`) + wait
      for wm_class (same timeouts as Python). Ghostty multi-instance
      flag stays (`--gtk-single-instance=false`).
- [x] Import `partitionMixedSteps` from `lib/extension/run-steps.js`.
      **Delete** `layout_lib.partition_mixed_steps` (and pytest cases
      that only tested the Python twin).
- [x] `run` / `run-steps` remain job mutators. Flow:

  ```text
  TTY: python forge run-steps …     # job parent
    worker: python forge run-steps …  # FORGE_JOB_WORKER=1
      exec node cli/run-steps.mjs …
  ```

- [x] Python `cmd_launch` / `cmd_run` / `cmd_run_steps` are `exec_cli`
      shims (job gate still in Python main).
- [x] Vitest for Node parse/partition/launch helpers (mock subprocess).
- [x] Pytest for shims / job path still green.
- [x] No `job_runner.py` port. No `layout_plan` port. No new npm deps.
- [x] Do not drop Python `gi` backend.
- [x] Job flow documented in `cli/README.md` → **CN7 skip**.

## Context for the next agent (complete + succinct)

### Landed

| Path | Role |
| --- | --- |
| `cli/launch-lib.mjs` | desktop resolve, spawn, class eq, wait, doLaunch, mixed runner |
| `cli/launch.mjs` | `forge launch` body |
| `cli/run-steps.mjs` | extension-only RunSteps; rejects CLI ops |
| `cli/run.mjs` | mixed file; uses JS `partitionMixedSteps` |
| `scripts/forge/forge` | shims + `_NO_DBUS_COMMANDS`; layout keeps Python `do_launch` / `_partition_mixed_steps_layout` |
| `scripts/forge/layout_lib.py` | `partition_mixed_steps` **deleted** |
| `cli/README.md` | job parent → worker → Node exec flow (CN7 skip) |
| Vitest | `launch` / `run` / `run-steps` + helpers |
| Pytest | `test_cn6_shim.py` |

### Layout note

CLI `forge launch` / `run` use Node. **`forge layout` still calls Python
`do_launch` / `run_mixed_steps`** in-process (not broken). Private
`_partition_mixed_steps_layout` remains for layout only until ApplyLayout
(D037) removes the need.

### Test

```bash
npm test -- tests/unit/cli/ tests/unit/extension/run-steps.test.js
python3 -m pytest tests/unit/cli/test_cn6_shim.py \
  tests/unit/cli/test_cn5_shim.py tests/unit/cli/test_node_exec.py \
  tests/unit/cli/test_layout_lib.py tests/unit/cli/test_job_runner.py -q
node cli/smoke-import.mjs
```

### Do not (still)

- Port layout / job_runner / layout_plan
- Add npm deps / dbus-next
- Drop Python gi
- Flip root `package.json` `"type"`

## Session note

**2026-08-15:** CN6 done. Node launch/run/run-steps; Python shims; job
parent intact; partition twin deleted from layout_lib; layout still has
Python do_launch. Vitest **145 PASS** (cli + run-steps); pytest targeted
**110 PASS**. CN7 **skip** (flow documented). Next: residual R027/Wave Z
or AL0 design (4.6).
