# forge-nested-isolation_n3-auto-cleanup — Nest auto stop + stale reaper

**Status:** ready  
**Plan:** [forge-nested-isolation](../plans/forge-nested-isolation.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends on:** D022 (done)

## Goal

Nested campaigns must **never** leave orphan dbus/shell for the operator.
Auto-stop and cleanup are product behavior, not agent memory alone.

## Acceptance

- [ ] `forge nested exec -- …` stops nest on process exit if this exec started
      the nest **or** document/clear policy: campaigns use a single entry that
      always stops (prefer: `forge nested run -- …` or exec with
      `--keep` opt-out)
- [ ] On any normal/error exit path of the campaign entry: `status` →
      `running: False`; bus socket/pids cleaned (existing stop logic)
- [ ] Stale pid/bus reaper: `stop` / `status` / `start --replace` recover when
      pid files lie
- [ ] Units for policy helpers where pure; live smoke: start → exec true →
      status False (or run wrapper equivalent)
- [ ] Agent docs point at auto-cleanup (N4 may finish prose)

## Context for the next agent

- Code: `scripts/forge/nested_wayland.py` (`exec_in`, `stop`, `start`)
- FIRM stop already in testing.md — this makes it **mechanical**
- Do not require dual mon for this task
- Prefer small API: e.g. `forge nested run [--monitors=N] -- cmd` =
  start if needed → merge env → run → **always stop**

## Session note

Created 2026-08-10 as first implement slice after D022 lock.
