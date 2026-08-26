# Task: CA5 — Extract soft rehome + safeMoveToMonitor

**Plan:** [forge-codebase-audit.md](../plans/forge-codebase-audit.md)  
**Status:** implemented (await B verify)  
**Risk:** med  
**Mode:** A/B implement–verify  

---

## Goal

Isolate the workareas **soft-rehome** cluster from `window.js`. Optionally share a small `safeMoveToMonitor(meta, idx)` helper for try/catch Meta moves. Behavior unchanged: settle debounce, entered-monitor suppress, T6-first, majority tab/stack align, shield branch.

---

## Primary files

- **New:** `lib/extension/soft-rehome.js` (or fold into recovery sibling if clearer; prefer separate for CA4/CA5 boundaries)
- `lib/extension/window.js` — thin delegates / event wiring
- May reuse `sessionLayoutTrace` from `session-layout-restore.js`

---

## Move candidates

- `_queueSoftRehomeOnWorkareas` / workareas settle timer
- `_softRehomeAfterWorkareas`
- group majority align for tab/stack during soft rehome
- resolve soft mon / last-good snapshot helpers used only by soft rehome
- optional: `safeMoveToMonitor` used by soft rehome + trivial dock/session sites if low-risk

**Do not** move session-layout restore body (already CA4).

---

## Acceptance

- [x] Soft rehome behavior unchanged (300ms settle, suppress entered-monitor, T6-first, majority tab align, shield branch)
- [x] Shared move helper where trivial and safe (`safeMoveToMonitor` + dock sticky)
- [x] `bug-h1-soft-rehome-workareas-thrash` green
- [x] `window.js` further reduced (report delta)
- [x] Full `npm test` green
- [x] Task + plan session notes updated

---

## Out of scope

- Changing WORKAREAS_SETTLE_MS or T6 algorithm
- Raise policy (CA6)
- Tree layout extract (CA7)

---

## Test plan

```sh
npm test
# focus: tests/regression/bug-h1-soft-rehome-workareas-thrash.test.js
```

---

## Session note

**2026-07-25 (CA5 A):** Extract shipped, zero intentional behavior change.

| Metric | Value |
| --- | --- |
| `window.js` | **4431** (−239 vs CA4 **4670**) |
| `soft-rehome.js` | **339** |
| Tests | 184 files / **1868** passed |

**API surface (`SoftRehomeManager` via `wm.softRehome`):**
- `queueSoftRehomeOnWorkareas()`
- `softRehomeAfterWorkareas()`
- `alignSoftRehomeGroupTargets(targets, nMonitors)`
- `resolveSoftRehomeMonitor(wNode, geometries, nMonitors)`
- `snapshotLastGoodHomes()`

**Exports:** `WORKAREAS_SETTLE_MS`, `safeMoveToMonitor(meta, monIdx, logTag?)`

**WM thin wrappers (spies/tests unchanged):** `_queueSoftRehomeOnWorkareas`, `_softRehomeAfterWorkareas`, `_alignSoftRehomeGroupTargets`, `_resolveSoftRehomeMonitor`, `_snapshotLastGoodHomes`

**Still on WM:** `_workareasThrashPending`, `_workareasSettleSrcId`, `_lastGoodHomes`, entered-monitor thrash/shield consult, workareas-changed signal → thin queue.

**Next for B:** review diff for collateral; re-run `npm test`; confirm settle 300 / T6-first / shield branch / majority align intact.
