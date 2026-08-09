# forge-cli-jobs_cj1-runner-core — Job runner core

**Status:** ready  
**Plan:** [forge-cli-jobs](../plans/forge-cli-jobs.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Implement the attachable one-shot job runner used by durable `forge` commands:
spawn worker in a new session, status/log dir, parent attach (stream + wait),
HUP-safe worker, single-flight lock. No full CLI wire-up required beyond a
minimal hook or self-test entry if useful.

## Acceptance

- [ ] Job dir under `~/.local/share/forge/jobs/<id>/` (`pid`, `status.json`, logs)
- [ ] Worker survives simulated parent death / SIGHUP (unit or integration)
- [ ] Attach parent streams worker output and propagates exit code
- [ ] Single-flight lock for mutating jobs
- [ ] Cooperative cancel path callable from parent (SIGINT → worker)
- [ ] `--foreground` / `FORGE_JOB=0` can still run work in-process (API ready)
- [ ] Unit tests for status machine / reaper hooks / lock (CJ4 may extend)

## Context for the next agent (complete + succinct)

- Plan locks: durability default; `--detach` = no wait only; jobs not daemon
- Prefer new module e.g. `scripts/forge/job_runner.py`; keep pure helpers testable
- Worker must inherit session DBus/DISPLAY env when spawned from user session
- Do not require systemd
- CJ2 wires real subcommands; this task is the mechanism
- On plan complete: **must** update project.md + README (arch + long first-load
  warning) — see plan doc ship gate (CJ6)

## Session note

Created with plan; not started.
