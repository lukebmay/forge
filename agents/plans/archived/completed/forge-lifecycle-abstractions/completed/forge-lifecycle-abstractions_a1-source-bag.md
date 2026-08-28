# forge-lifecycle-abstractions_a1-source-bag — SourceBag pure + unit tests

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../plans/forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends:** D0 locked

## Goal

Implement **L1 SourceBag** as a pure, injectable GLib source owner with comprehensive unit tests. Re-home `glibSchedule`/`glibCancel`. First wire owner: **open-commit** timers.

## Acceptance

- [x] `lib/extension/sources.js` — SourceBag, glibSchedule/Cancel/IdleSchedule, inject, named slots, cancelAll/dispose, snapshot()
- [x] LC re-exports glibSchedule/glibCancel from sources.js
- [x] `tests/unit/extension/sources.test.js` — leak-free dispose, replace, fire, idle, throw swallow
- [x] Open-commit wired to SourceBag (`label: open-commit`); inject fields still work for tests
- [x] Dev logging: `[SourceBag:label]` set/replace/cancel/fire/dispose + `[open-commit]` schedule/arm/fire/cancelAll with slot, class, delays, bag snapshot
- [x] Open-commit + LC + geom-open unit suites green

## Context for the next agent (complete + succinct)

- **Shipped:** `lib/extension/sources.js`, open-commit uses `_openCommitSources` with schedule wrappers reading `_openCommitSchedule`/`_openCommitCancel` (tests inject those fields).
- **Logging:** enable `logging-enabled` + log-level DEBUG/TRACE on host; grep journal for `[SourceBag:open-commit]` and `[open-commit]`.
- **snapshot():** call `_openCommitSources.snapshot()` on failure dumps (no log gate).
- **Next pure:** L6 settle-math kernel (shared rolling max×pad) + golden parity — not full product merge.
- **Next wire:** more WM named sources (queue, renderTree, …) onto a WM-level SourceBag; then SignalBag.
- **Do not:** utils split; catalog rewrite; Wayland RC as main track.

## Session note

- 2026-08-10: A1 implemented + open-commit first wire + high-signal debug logs. Tests: sources, open-commit, layout-controller, geom-open-runsteps all green.
