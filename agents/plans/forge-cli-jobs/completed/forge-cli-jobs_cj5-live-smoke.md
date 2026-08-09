# forge-cli-jobs_cj5-live-smoke — Live parent-kill + cancel smoke

**Status:** completed  
**Plan:** [forge-cli-jobs](../../forge-cli-jobs.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Prove on X11 that killing the attach parent mid-`forge layout` leaves the job
running to a terminal status, and that cancel works. Retire docs/notes that only
existed because TTY death killed apply.

## Acceptance

- [x] Start `forge layout <profile>` (attach), kill attach parent only → job
      reaches `ok` or `failed` on disk (not silent half-death)
- [x] `forge jobs cancel <id>` cooperative stop → `cancelled` / 130
- [x] HANDOFF / testing / project notes updated (TTY no longer aborts apply)
- [x] True-cold window placement notes retained

## Context for the next agent (complete + succinct)

- **Parent-HUP:** `forge layout dev` attach → `kill -HUP $parent` → worker status
  `ok` exit 0 (X11 black, 2026-08-09)
- **Cancel:** `layout dev --detach` then `forge jobs cancel` → `cancelled` 130
- **CJ6** docs ship gate also done same session

## Session note

2026-08-09: Both smokes green on X11 with extension up.
