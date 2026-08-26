# forge-log-sink-policy — Journal WARN+ERROR; prod INFO; --dev DEBUG

**Status:** done
**Plan:** (none) — follows D050/D052/D053
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-23
**Agent:** **4.5** (high reasoning)

## Goal

Lock dual-sink + install defaults to the operator policy below. Fix gaps.
Do **not** bulk-rewrite call sites; policy + sinks + defaults + docs.

## Locked policy (operator 2026-08-23)

| Sink / mode | Behavior |
| --- | --- |
| **File** (`forge.log`) | Levels at/above effective log-level (TRACE…ERROR when raised) |
| **Journal** | **WARN + ERROR (+ fatal) only** — **not** INFO, never DEBUG/TRACE |
| **Regular / prod install** | log-level **INFO (4)**; file gets ERROR/WARN/INFO |
| **`./install --dev`** | log-level **DEBUG (5)** |
| **`production` flag** | Must **not** force logging OFF. Prod may still use INFO. Asserts stay: active when `!production` **or** level ≥ DEBUG (existing OH3) |
| **`log.debug`** | Dev/hunt only — prod commit candidates run at INFO so debug is silent |
| **`log.trace`** | Opt-in firehose: useful path/id info (layout modes, jitter, install steps) — verbose but not junk |

Also: **`agents/project.md`** — when testing/hunting, switch to TRACE (`forge log trace`) for more detail.

## Acceptance

- [x] Journal pipeline excludes `info` (unit: INFO not journaled; WARN/ERROR still are; TRACE/DEBUG file-only)
- [x] `production=true` no longer forces OFF; durable/effective respect gsettings / INFO default
- [x] `./install` / regular → INFO; `./install --dev` → DEBUG; `./install --prod` → still `production=true` build **and** sets log-level INFO (logging-enabled true) unless a clear reason not to
- [x] Docs: D050/D052/contracts/troubleshooting/DESIGN/project.md match policy
- [x] `project.md` has explicit “when testing, raise to TRACE” note
- [x] L0: plog-adapter (+ any install-related) tests green
- [x] Session note on this task + HANDOFF/PRIORITY one-line if status changed

## Out of scope

- Bulk TRACE↔DEBUG call-site retarget across the tree
- Rotating archives / delete-on-disable

## Context for the next agent

- Adapter: `lib/shared/plog-adapter.js` — `pipeline()` journals warn|error|fatal; removed `production` early OFF from `durableLevel` / `effectiveLevel` / `getLogStatus`
- Install: `scripts/forge/build-install.zsh` now sets gsettings for **all** modes including `--prod` (INFO); `--dev` still DEBUG
- Asserts unchanged: `!production` OR level ≥ DEBUG (`lib/shared/assert.js`)
- Amended D050/D052 (no new DECISIONS row)
- Proven: `npm test -- tests/unit/shared/plog-adapter.test.js tests/unit/shared/logger.test.js` → 47 pass
- Uncommitted on master (operator did not ask to commit)

## Session note

Shipped sink policy on master: journal WARN+ only; production no longer forces
logging OFF; `./install --prod` sets logging-enabled + log-level INFO; docs
amended (D050/D052). Next remains OH downstream.
