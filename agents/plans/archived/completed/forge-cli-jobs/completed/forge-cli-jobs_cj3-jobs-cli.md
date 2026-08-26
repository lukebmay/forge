# forge-cli-jobs_cj3-jobs-cli — forge jobs subcommands

**Status:** completed  
**Plan:** [forge-cli-jobs](../../forge-cli-jobs.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Expose job management on the CLI: list, status, attach, cancel, log. Reap
stale jobs on `forge jobs` entry (and keep reap on mutator entry from CJ2).

## Acceptance

- [x] `forge jobs` — list jobs (active first; show id, status, command, pid, age)
- [x] `forge jobs status <id>` — machine-readable status.json (pretty or compact)
- [x] `forge jobs attach <id>` — re-attach streams + wait (if still running)
- [x] `forge jobs cancel <id>` — cooperative SIGINT/SIGTERM to worker group
- [x] `forge jobs log <id>` — show or tail stdout/stderr logs (`-f` follow)
- [x] Reaper runs on `forge jobs` entry; dead workers → terminal status
- [x] Help text documents jobs + `--detach` (cli_help quick start)
- [x] Unit tests for CLI dispatch (`JobsCli` in test_job_runner.py)

## Context for the next agent (complete + succinct)

- **cmd:** `cmd_jobs` in `scripts/forge/forge`; no DBus; in `_NO_DBUS_COMMANDS`
- **Id:** full id or unique prefix (`_jobs_resolve_id`)
- **Attach terminal job:** dumps logs + returns stored exit_code
- **Next:** CJ4 mostly covered by existing units (extend if gaps); **CJ5** live
  parent-kill smoke on X11; **CJ6** docs ship gate (project.md + README arch +
  long first-load warning, DECISIONS, DESIGN, user/scripts README, HANDOFF)

## Session note

2026-08-09: Implemented list/status/attach/cancel/log; help updated; 31 unit
tests green. Live `forge jobs` after `--detach` layout smoke OK.
