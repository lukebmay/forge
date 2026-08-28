# forge-lifecycle-abstractions_w3-residual-wm-timers — leftover WM field timers → SourceBag

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../plans/forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends:** W1 `_wmSources`; W2 L4 stack done

## Goal

Finish W1 residual: migrate `_previewHintFailsafeId` and `_sessionFocusRetrySrcId`
onto `wm._wmSources` named slots so `_clearTimeoutId` field ownership can die.

## Scope (do)

| Item | Detail |
| --- | --- |
| Slot `previewHintFailsafe` | `drag-drop.js` arm/clear failsafe → `_wmSources.set` / `cancel` (same ms as today) |
| Slot `sessionFocusRetry` | `session-layout-restore.js` idle focus retry → `_wmSources.setIdle` / `cancel` |
| disable | Already `_wmSources.cancelAll()` — ensure no field clear remains required |
| Remove | Production `_previewHintFailsafeId` / `_sessionFocusRetrySrcId` fields; drop `_clearTimeoutId` if unused |
| e2e bridge | Stop counting field timers; bag slots already in cancelAll |
| Tests | Touch drag-drop / session-layout / window unit suites if they assert field ids |

## Non-goals

- SignalBag WM arrays
- SuppressFlag sites
- L8 OpenCommit extract / L11 batch-depth
- Live Shell / nest / Wayland RC

## Acceptance

- [x] Both residual timers bag-only on `_wmSources` (no dual field ids)
- [x] `_clearTimeoutId` gone or unused with no callers
- [x] cancelAll on disable still covers them
- [x] Related unit tests green
- [x] W2 `_windowAttach` / open-commit untouched except coexistence

## Context

- Pattern: W1 — `wm._wmSources.set("name", ms, cb)` / `setIdle("name", cb)` / `cancel("name")`
- SourceBag auto-clears slot on fire; `set` replaces prior
- Arm sites: `lib/extension/drag-drop.js` `_armPreviewHintFailsafe` / `clearAllPreviewHints`; `session-layout-restore.js` `_scheduleSessionFocus`
- Do **not** start Wayland RC

## Session note

- 2026-08-10: Migrated residual field timers onto `_wmSources` (now **12** slots).
  - `previewHintFailsafe` — timeout 4000ms; `clearAllPreviewHints` cancel; arm via `set` (replace).
  - `sessionFocusRetry` — `setIdle`; schedule-null falls back to immediate activate (unit GLib gap).
  - Removed `_clearTimeoutId` from `window.js` (no callers). Dropped unused `GLib` import from `drag-drop.js`.
  - e2e bridge: timers = bag size only (+ WindowAttach sources).
  - Grep clean in `lib/` + `tests/` for field names. Unit: window/ + extension/ + sources **1189** green.
  - Untouched: W2 stack attach, open-commit, SignalBag/SuppressFlag.
  - Residual risks: idle priority now DEFAULT (SourceBag) not DEFAULT_IDLE — same as other W1 idles; failsafe fire → clearAll cancel-miss is fine.
