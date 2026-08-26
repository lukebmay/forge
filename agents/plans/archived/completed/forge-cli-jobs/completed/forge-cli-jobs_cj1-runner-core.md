# forge-cli-jobs_cj1-runner-core — Job runner core

**Status:** completed  
**Plan:** [forge-cli-jobs](../../forge-cli-jobs.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Implement the attachable one-shot job runner used by durable `forge` commands:
spawn worker in a new session, status/log dir, parent attach (stream + wait),
HUP-safe worker, single-flight lock. No full CLI wire-up required beyond a
minimal hook or self-test entry if useful.

## Acceptance

- [x] Job dir under `~/.local/share/forge/jobs/<id>/` (`pid`, `status.json`, logs)
- [x] Worker survives simulated parent death / SIGHUP (unit or integration)
- [x] Attach parent streams worker output and propagates exit code
- [x] Single-flight lock for mutating jobs
- [x] Cooperative cancel path callable from parent (SIGINT → worker)
- [x] `--foreground` / `FORGE_JOB=0` can still run work in-process (API ready)
- [x] Unit tests for status machine / reaper hooks / lock (CJ4 may extend)

## Context for the next agent (complete + succinct)

- **Module:** `scripts/forge/job_runner.py`
- **Tests:** `tests/unit/cli/test_job_runner.py` (21 passed)
- **Job root:** `~/.local/share/forge/jobs/<id>/` or `$FORGE_JOBS_DIR` / `$XDG_DATA_HOME/forge/jobs`
- **Files per job:** `status.json`, `pid`, `argv.json`, `stdout.log`, `stderr.log`
- **Lock:** `mutator.lock` (JSON `{job_id,pid}`); single-flight via claim + live pid check
- **API for CJ2:**
  - `job_mode_enabled(env, foreground=False)` — False for `FORGE_JOB=0` / worker / `--foreground`
  - `maybe_run_as_job(worker_argv, detach=..., foreground=..., command=..., timeout_sec=...)` → exit code or `None` (in-process)
  - `run_job` / `spawn_worker` / `attach` / `request_cancel` / `reap_stale_jobs` / `list_jobs` / `load_handle`
  - Worker side: `worker_install_signal_policy()`, `worker_mark_done(exit_code)`
- **Env:** `FORGE_JOB_WORKER=1`, `FORGE_JOB_ID`, `FORGE_JOB_DIR`, `FORGE_JOB=0` (no nest), `FORGE_JOB_TIMEOUT`
- **Worker spawn:** `start_new_session=True` + preexec ignore SIGHUP; logs to files; attach tails + waitpid
- **Zombies:** attach reaps via `waitpid(WNOHANG)` (kill 0 is true for zombies)
- **Not wired:** forge CLI subcommands still in-process — **CJ2**
- Plan complete still requires **CJ6** docs (project.md + README first-load warning)

## Session note

2026-08-09: Implemented `job_runner.py` + unit suite. Parent-death, SIGHUP,
single-flight, cancel, timeout→124, stream+exit code covered. Next: **CJ2**
wire mutators + `--detach` / `--foreground`.
