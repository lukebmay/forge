# Task — FC4: forge run-steps / freezeRender batch

**Status:** Done (A/B **AGREE**)
**Plan:** [forge-command.md](../plans/forge-command.md)  
**Priority:** P1  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-command/completed/`

## Problem

Morning scripts need many atomic ops without flicker. FC1–FC3 expose single
ops; missing is batched execution with quiet render.

## Goals

1. **In-process RunSteps engine** (pure-ish step runner + WM integration):
   - Input: array of step objects `{ "op": "…" , … }`
   - Ops (MVP, map to existing SessionApi / CommandHandler / tree where possible):
     - `focus` — `{ op, selector }`
     - `swap` — `{ op, a, b }`
     - `move` — `{ op, tile, dest }`
     - `layout` — `{ op, mode: tabbed|stacked|hsplit|vsplit, selector? }` via CommandHandler names if available
     - `place-next` — `{ op, …PlaceNext fields }`
     - `set` — `{ op, key, value }` settings
     - optional `ping` no-op for dry tests
   - **Not** in extension (CLI owns): `launch`, `wait-window` — document that
     CLI `forge run` interleaves spawn/wait with DBus RunSteps chunks, OR
     accepts a mixed script and splits (prefer CLI orchestration)
2. **freezeRender** for whole batch → unfreeze → single `renderTree("run-steps")`
   (unless step explicitly needs mid-batch render; default quiet)
3. **DBus `RunSteps(steps_json: s) → s`** → `{ok, results:[{ok|error}…]}` or
   stop-on-error with index
4. **CLI**:
   - `forge run-steps '<json>'` or `forge run <file.json>`
   - File may be `{ "steps": [...] }` or bare array
5. Unit tests for step dispatch table / validation pure helpers; `npm test`
6. DESIGN note; plan wrap. **No workon DSL (FC5).**

## Acceptance

- [x] RunSteps freezes, runs ops, unfreezes, one render
- [x] Supported ops work via existing primitives
- [x] Failures return per-step or stop with index; no DBus throw
- [x] CLI run / run-steps
- [x] Launch/wait remain CLI-side (documented)
- [x] `npm test` green (1833 tests)
- [x] No workon (FC5)

## Out of scope

- Full morning profile compiler / declarative tree
- gdisplays integration
- workon wrapper

## Session note

**Task Force B (2026-07-25) — AGREE**

Verified against acceptance:
- RunSteps: freeze → `runStepsDispatch` quiet handlers → restore freeze /
  one `renderTree("run-steps", true)` when not nested-frozen
- Nested freeze: `prevFrozen` skips unfreeze + final render (confirmed OK)
- Ops map to quiet cores; CLI-only launch/wait rejected pure + CLI
- Errors: JSON `{ok, results, stoppedAt?}` / top-level parse `error`; no throw
- CLI `run` / `run-steps`; DESIGN FC4 present; no workon
- `npm test` **1833** green; pure suite 20/20

**One-liner fix (B):** `_cmd_result` treated `{ok:false, results…}` (no
top-level `error`) as success — scripts would exit 0 on step failure.
Now returns 1 when `ok is False` (`scripts/forge/forge`).

**Residuals (non-blocking):** live DBus smoke; mixed-script interleave
deferred; focus→activate may still hit WM `renderTree("focus", true)` force
path mid-batch (pre-existing signal behavior, not RunSteps own quiet path).

**Task Force A (2026-07-25):**

Shipped:
- `lib/extension/run-steps.js` — pure parse/validate/`runStepsDispatch` /
  `partitionMixedSteps`; CLI-only ops rejected
- `session-api.js` — quiet `_focusOp`/`_swapOp`/`_moveOp`/`_layoutOp`/
  `_placeNextOp`/`_setOp`; `RunSteps` freezes → dispatch → unfreeze +
  `renderTree("run-steps", true)`; `SESSION_API_VERSION = 5`
- CLI `forge run` / `forge run-steps` (+ `--file`); refuse launch/wait in payload
- Tests: `tests/unit/extension/run-steps.test.js`
- DESIGN.md FC4 section

**Op list (extension):** ping, focus, swap, move, layout, place-next, set  
**CLI-only:** launch, wait-window, wait
