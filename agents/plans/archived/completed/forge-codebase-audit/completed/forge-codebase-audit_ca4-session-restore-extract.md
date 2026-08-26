# Task: CA4 — Extract session-layout restore orchestration

**Plan:** [forge-codebase-audit.md](../plans/forge-codebase-audit.md)  
**Status:** verified (B AGREE)  
**Risk:** med  
**Mode:** A/B implement–verify  

---

## Goal

Move session save/restore/rehome/raise/shield/trace **orchestration** out of `WindowManager` into a dedicated module. `window.js` keeps thin public methods for enable/DBus. Pure logic stays in `session-layout.js` / `tree-snapshot.js`.

**Target:** drop ~350–500 lines from `window.js` with **no** behavior change (match order, richness, hold, shield timing unchanged).

---

## Primary files

- **New:** `lib/extension/session-layout-restore.js` (name flexible; pick clear name)
- `lib/extension/window.js` — thin delegates
- May touch imports only in tests if they mock WM methods

---

## Suggested move set (orchestration only)

From `window.js` / WindowManager:

- `sessionLayoutTrace` / `metaWinLabel` (module-local helpers OK)
- save queue / hold / flush / `_saveSessionLayoutForReload`
- `_restoreSessionLayoutAfterTrack`
- rehome forest + strict apply + raise-after-restore
- seed last-good + shield active/reapply
- home-trace helpers used only by session restore

**Keep pure algorithms in** `session-layout.js` and `tree-snapshot.js` — call them from the new module.

**Pattern:** manager class with `wm` / `_extWm` ref (like `decoration.js` / `focus.js`), **or** free functions taking `wm`. Prefer consistency with existing managers.

Public WM API to preserve (thin wrappers OK):

- `flushSessionLayout`
- enable-path restore hooks
- shield hooks used by soft rehome (CA5 will still call through WM or shared module)

---

## Acceptance

- [x] New module owns orchestration; window.js thin delegates
- [x] Public WM API preserved for enable / DBus / soft-rehome call sites
- [x] Match order / richness / hold / shield timing unchanged
- [x] `window.js` line count drops ≥350 net (or document why less)
- [x] `session-layout` unit + `bug-h1-soft-rehome-workareas-thrash` green
- [x] Full `npm test` green
- [x] Task + plan session notes updated

---

## Out of scope

- Soft-rehome body extract (CA5)
- Changing recovery policy
- DnD extract
- Raising/restack policy redesign (CA6)

---

## Test plan

```sh
npm test
# focus: tests/unit/extension/session-layout.test.js
#        tests/regression/bug-h1-soft-rehome-workareas-thrash.test.js
```

---

## Risks

- Shield / thrash flags (`_sessionLayoutShield`, `_sessionLayoutRestoring`, `_workareasThrashPending`) must stay correctly wired through thin delegates
- Do not break HUP / install reload path

---

## Session note

**2026-07-25 (CA4 A):** Extract shipped.

- **New:** `lib/extension/session-layout-restore.js` — `SessionLayoutRestoreManager` (GObject, `_tree` + `_extWm` like decoration/focus).
- **Also exports** `sessionLayoutTrace` for soft-rehome paths still in `window.js` (CA5 will own those).
- **Flags stay on WM:** `_sessionLayoutShield`, `_sessionLayoutRestoring`, `_sessionLayoutSaveHoldUntil`, `_sessionLayoutSaveSrcId`, `_lastGoodHomes` — manager mutates live via `_extWm`.
- **Cross-calls** route through `_extWm` so WM spies still work.
- **Line delta:** `window.js` HEAD 5061 → **4670** (−**391**); new module **495** lines.
- **`npm test`:** 184 files / **1868** tests passed (incl. session-layout + h1 soft-rehome).

**Thin WM wrappers preserved:**  
`_sessionLayoutShieldActive`, `_reapplySessionLayoutShield`, `_traceSessionLayoutHomes`, `_queueSessionLayoutSave`, `_holdSessionLayoutSave`, `_saveSessionLayoutForReload`, `flushSessionLayout`, `_restoreSessionLayoutAfterTrack`, `_seedLastGoodHomesFromSession`, `_rehomeWindowsForSessionForest`, `_restoreSessionForestStrict`, `_raiseAfterSessionRestore`.

**Next:** orchestrator wrap (CA5 soft-rehome extract when ready).

**2026-07-25 (CA4 B):** **AGREE**

- Module + thin WM wrappers OK; soft-rehome body remains in `window.js` (not CA5).
- Hold 12s, shield +3s, richness `newR+5<oldR`, `resolveStrictMonitor`×3 on session path.
- Soft rehome still hits shield via WM wrappers.
- Lines: `window.js` 5061→**4670** (−**391**); new module **495**.
- `npm test`: 184 files / **1868** passed (session-layout + h1 soft-rehome green).
- Nit (non-blocking): success restore now also `Logger.info` (HEAD was trace-only); mono via `Utils.monoTimeUs` ≡ prior inline.
