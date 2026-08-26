# forge-cli-jobs_cj2-wire-mutators — Wire mutating CLI to job runner

**Status:** ready  
**Plan:** [forge-cli-jobs](../plans/forge-cli-jobs.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Route in-scope mutating `forge` commands through the CJ1 job runner by default
(attach). Add `--detach` and `--foreground` / `FORGE_JOB=0`. Worker re-enters
the same code path in-process (`FORGE_JOB_WORKER=1`).

## Acceptance

- [ ] `forge layout <name>` (apply) and `forge layout clean` run as jobs by default
- [ ] `forge run` / `run-steps` (long paths) use jobs
- [ ] `forge install` / `update` / `uninstall` use jobs
- [ ] `forge test live run` uses jobs
- [ ] Default = durable + attach; `--detach` prints job id and returns
- [ ] `--foreground` and `FORGE_JOB=0` keep in-process path
- [ ] Worker does not re-wrap (nesting disabled via env)
- [ ] Busy mutator → clear error with running job id
- [ ] `worker_mark_done` / signal policy on worker exit path
- [ ] Fast/read-only commands unchanged (`ping`, `tree`, `layout list|show`, …)

## Context for the next agent (complete + succinct)

- Runner: `scripts/forge/job_runner.py` — use `maybe_run_as_job` or `run_job`
- Worker argv should re-invoke the same forge entry with same args + job env
  (`sys.executable` + forge script path, or `sys.argv[0]`)
- Strip `--detach` from worker argv if present so worker runs the real work
- Parse global/subcommand flags for `--detach` / `--foreground` early in `main`
- Reap on entry: `reap_stale_jobs(default_jobs_root())` before claim
- CJ3 adds `forge jobs *` CLI; status/list helpers already exist
- Units: extend or add wire-level tests if pure; live smoke is CJ5
- Docs ship gate remains CJ6

## Session note

Created after CJ1 completion; not started.
