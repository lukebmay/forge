# Task — FC2: `forge launch` + wait/place

**Status:** Done (A/B **AGREE**)
**Plan:** [forge-command.md](../plans/forge-command.md)  
**Priority:** P1  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-command/completed/`

## Problem

Scripts need to open apps and land them on the tiling tree (after LFT by
default; explicit monitor/path when requested). FC0/FC1 can inspect and move
tiles but cannot launch+wait.

## Goals

1. **CLI `forge launch <app-or-desktop-id>`** (out-of-process launch preferred):
   - Resolve app: desktop id (`gio launch` / `gtk-launch` / `gio open`), or
     executable on PATH as fallback
   - Default placement: **do nothing special** — rely on OP1 LFT attach when the
     window maps under Forge
   - Options:
     - `--wm-class=` wait matcher (required for wait unless inferable)
     - `--timeout=ms` (default sensible, e.g. 15000)
     - `--no-wait`
     - `--monitor=<index|moN|stableKey|role>` explicit home (optional)
     - `--tree-path=` / attach selector (optional; overrides LFT)
     - `--last-focused` default true (document; no-op if OP1 already default)
   - Exit non-zero on launch fail / wait timeout; print JSON or clear message
2. **DBus place hint** for explicit place (when monitor/path given):
   - e.g. `PlaceNext(options_json) → s` one-shot consumed on next matching map
     OR `Place(selector, dest)` using FC1 Move for already-mapped windows
   - Wire pending hint into `trackWindow` / `_planOpenAppPlacement` so explicit
     launch lands correctly without Shell.Eval
   - Match by wmClass and/or window id when provided
3. Unit tests for pure helpers (app id parsing, place-hint match, timeout math);
   integration of place-hint into open-plan with mocks if feasible.
4. DESIGN note; plan/task updates; `npm test` green.

## Code touch list (expected)

| Area | Notes |
| --- | --- |
| `scripts/forge/forge` | `launch` subcommand |
| `lib/extension/session-api.js` | PlaceNext and/or Place |
| `lib/extension/window.js` | consume place hint in open plan |
| Pure helper module optional | place-hint / launch wait |
| Tests | pure + open-plan mock |
| DESIGN | CLI launch + place hint |

## Acceptance

- [x] `forge launch` spawns app (desktop id or command)
- [x] Default path uses OP1 (LFT attach) without place hint
- [x] Explicit `--monitor` / path sets place hint consumed on match
- [x] Wait for wmClass in tree (GetTree poll or DBus helper) unless `--no-wait`
- [x] Timeout / missing class → non-zero exit + clear error
- [x] DBus place API returns JSON ok/error; no throw
- [x] `npm test` green (1790)
- [x] No settings CLI (FC3), RunSteps (FC4), workon (FC5)

## Out of scope

- Full desktop-file search polish beyond common paths
- Dock sticky (OP1 already)
- Batch multi-launch (FC4)
- `workon` profiles

## Session note

**A shipped FC2 (ready for B).**

### Files
- `lib/extension/place-hint.js` — pure match/normalize/queue/monitor resolve
- `lib/extension/window.js` — `_pendingPlaceHints`, `placeNext`, plan prefers hint
- `lib/extension/session-api.js` — `PlaceNext(s)→s`, `SESSION_API_VERSION=3`
- `scripts/forge/forge` — `launch` subcommand (fc2)
- Tests: `place-hint.test.js`, open-app-policy PlaceNext cases
- Docs: `docs/DESIGN.md`, `scripts/forge/README.md`

### DBus
- `PlaceNext(options_json: s) → s`
- Options: `{ wmClass?, monitor?, treePath?, attachSelector?, ttlMs?, expiresAt?, first? }`
- Success: `{ ok: true, expiresAt, wmClass }` / error JSON, never throw
- Ping `apiVersion`: **3**

### CLI
```text
forge launch <app> [--wm-class=] [--timeout=ms] [--no-wait]
                 [--monitor=] [--tree-path=] [--first] [--last-focused]
```
- Launch: `gio launch` / `gtk-launch` desktop; else spawn argv
- PlaceNext only when `--monitor` or `--tree-path`
- Wait: poll GetTree for wmClass (baseline ids); JSON `{ok, windowId?, title?}`
- Already mapped: document `forge move` (no Place method)

### Residuals for B
- Live `gio launch` not unit-tested (no DBus e2e here)
- `--wm-class` required for wait (no aggressive desktop-id→class inference)
- attachSelector only via PlaceNext JSON (CLI exposes tree-path + monitor)

## Session note

**2026-07-25 B AGREE.** PlaceNext + CLI launch; OP1 default; 1790 tests.
Residuals: stale hint on spawn fail; mon roles; no live e2e.

**A:** place-hint.js, window placeNext, DBus PlaceNext, forge launch.
