# forge-lifecycle-abstractions_w1-wm-sources — Wire WM global timers → SourceBag

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../../forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends:** A1 SourceBag; pure L1–L5 done

## Goal

Migrate **WindowManager global GLib timers** that `_removeSignals`/`disable`
clears via `_clearTimeoutId` onto a **WM-level SourceBag** so dispose/cancelAll
owns them (one checklist shrink).

## Scope (do)

| Item | Detail |
| --- | --- |
| Bag | `this._wmSources = new SourceBag({ label: "wm" })` (or Lifetime.sources) on WM |
| Migrate slots | Prefer these named properties if present: `_queueSourceId`, `_workspaceChangingTimeoutId`, `_manualResizeEndId`, `_renderTreeSrcId`, `_reloadTreeSrcId`, `_wsWindowAddSrcId`, `_windowHomeReconcileSrcId`, `_pointerFocusTimeoutId`, `_workareasSettleSrcId`, `_sessionLayoutSaveSrcId` |
| Pattern | `this._wmSources.set("queue", ms, cb)` / `setIdle("renderTree", cb)`; `cancel("queue")` instead of field + `_clearTimeoutId` |
| disable path | `_removeSignals` → `this._wmSources.cancelAll()` (or dispose + recreate on enable — prefer **cancelAll** if bag lives across enable cycles like open-commit) |
| open-commit | Keep separate `_openCommitSources` (already owned) |
| Tests | Unit if WM tests exist for timers; else smoke extension unit suite; inject schedule if constructor allows |

## Non-goals

- Migrate per-window `_forgeStackTimeoutId` (L4 territory)
- Migrate all signal arrays to SignalBag this slice
- Lifetime full WM disable rewrite
- Live Shell / nest

## Acceptance

- [x] WM SourceBag exists with label `wm`
- [x] ≥4 former field timers use bag slots (ideally all disable-checklist ones)
- [x] `_removeSignals` cancels bag (no orphan ids for migrated slots)
- [x] Migrated property fields removed or no longer schedule path (no dual ownership)
- [x] Relevant unit tests green (`tests/unit/window/`, layout-controller, extension suite smoke)
- [x] open-commit bag unchanged and still green

## Context for the next agent (verify)

- **Bag:** `this._wmSources` (`label: "wm"`) next to open-commit; inject via `_wmSchedule` / `_wmCancel` / `_wmScheduleIdle` (cancelAll on disable, no dispose).
- **Slots migrated (10):** `queue`, `workspaceChanging`, `manualResizeEnd`, `renderTree` (idle), `reloadTree` (idle), `wsWindowAdd`, `windowHomeReconcile` (idle), `pointerFocus`, `workareasSettle`, `sessionLayoutSave`.
- **Files:** `window.js`, `focus.js`, `workspace.js`, `monitor-recovery.js`, `session-layout-restore.js`, `drag-drop.js`; `sources.js` sync-fire fix for idle mocks; tests + e2e bridge probe.
- **Repeating sources:** `queue` and `pointerFocus` re-arm via `set` while work continues (SourceBag is one-shot).
- **Priority note:** `reloadTree` / `sessionLayoutSave` were PRIORITY_LOW; bag uses DEFAULT — debounce ms / coalesce semantics same.
- **Unmigrated (intentional / residual):** per-window `_forgeStackTimeoutId` (L4); `_previewHintFailsafeId`; `_sessionFocusRetrySrcId`. `_clearTimeoutId` kept for those.
- **Tests run green:** `tests/unit/window/` (609), `sources` + `layout-controller`, `tests/unit/extension/` (627), related regressions.
- **Dump:** `wm._wmSources.snapshot()`.

## Session note

- 2026-08-10: Wire after pure L5. Serial after pure complete.
- 2026-08-10 implementer A: all 10 checklist timers on `_wmSources`; cancelAll in `_removeSignals`; open-commit separate; SourceBag sync-idle fire; unit/extension green; ready for verify.
- 2026-08-10 verifier B: **PASS**. Confirmed bag `label: "wm"` separate from open-commit; all 10 slots bag-only (no dual id fields); `_removeSignals` → `cancelAll` not dispose; SourceBag async path clears slot on fire + `glibSchedule`/`glibIdleSchedule` return SOURCE_REMOVE; cross-file callers OK; residual `_forgeStackTimeoutId` / `_previewHintFailsafeId` / `_sessionFocusRetrySrcId` intentional. Tests: sources 14, window 552, extension 627 green. No code fixes.
