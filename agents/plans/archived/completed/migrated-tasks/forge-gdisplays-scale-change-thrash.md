# forge-gdisplays-scale-change-thrash — Display geometry change must not thrash via entered-monitor

**Status:** completed  
**Plan:** (none) — residual of R016 (L1 retile); regression class **R017**  
**Branch:** master (default)  
**Blocker:** (none)  
**Priority:** P1 (daily driver; gdisplays scale / mode change)  
**Updated:** 2026-08-11  
**Regression id:** **R017**

---

## Goal

When gdisplays (or Mutter) **changes** monitor geometry (scale, mode, position) with the **same mon set**, Forge must keep tree **structure** (tabs/splits/order) and only structure-preserving retile (`renderTree`). It must **not** rehome individual windows via `window-entered-monitor` mid-reconfig, and must **not** poison the R016 quiet fingerprint so workareas settle no-ops after damage.

## Acceptance

### L0

- [x] Unit/regression: dual-mon quiet → geometry change → `window-entered-monitor` does **not** reparent; thrash-pending armed; settle → `workareas-retile` only (structure intact)
- [x] Quiet fp not updated while live ≠ quiet (snapshot skipped or homes-only without quiet overwrite)
- [x] Contrast: same geometry + entered-monitor still rehomes (normal mon move)
- [x] Existing R016/H1 guards still green

### L1 live

- [x] Repro confirmed pre-fix (topology destroyed; journal: entered-monitor then false workareas-noop)
- [x] Host desk restored after each thrash: `gdisplays load default` && `forge layout dev`
- [ ] **Host gdisplays smoke on tip** blocked until **logout** (or equivalent full Shell restart) — GJS module cache keeps pre-R017 code after disable/enable; journal still showed immediate entered-monitor rehomes
- [x] Nest dual-mon: ApplyMonitorsConfig scale flip arms `workareasSettle` without entered-monitor storm (empty desk → H1 settle path; no windows to pile)

### Docs

- [x] REGRESSIONS **R017** row  
- [x] DESIGN H1/R016 note: entered-monitor suppress when live fp ≠ quiet  
- [x] Task → completed/

## Session note (implementer 2026-08-11)

### Paths changed

| Path | Change |
| --- | --- |
| `lib/extension/workareas-policy.js` | `workareasGeometryEqual` (geometry-only; ignore stableKey format) |
| `lib/extension/monitor-recovery.js` | `displayGeometryChangedFromQuiet`, `_buildDisplayWorkareasFingerprint`; `snapshotLastGoodHomes` skips when live geom ≠ quiet |
| `lib/extension/window.js` | `_onWindowEnteredMonitor`: if geom drift from quiet → `_queueMonitorRecoveryOnWorkareas()` + return (no rehome) |
| `tests/regression/bug-r017-display-geom-change-no-entered-monitor-thrash.test.js` | **new** L0 guard |
| `tests/unit/extension/workareas-policy.test.js` | geometry-equal cases |
| `scripts/forge/live_matrix.py` | `L1.r017-gdisplays-scale-retile` note case |
| `tests/unit/cli/test_live_matrix.py` | catalog/tag R017 |
| `agents/REGRESSIONS.md` | R017 row |
| `docs/DESIGN.md` | R017 entered-monitor + snapshot gate |

### How tested

```bash
npm test -- tests/regression/bug-r017*.test.js \
  tests/regression/bug-r016-noop-workareas-no-thrash.test.js \
  tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js \
  tests/unit/extension/workareas-policy.test.js
# → 41 passed

python3 -m pytest tests/unit/cli/test_live_matrix.py -q -k 'r016 or r017'
# → 4 passed (after catalog tests added)
```

No live gdisplays thrash from implementer (orchestrator/tester).

### Residual risks

- **Host L1 gdisplays** still needs one **logout** after `./install` — disable/enable does not reload cached ES modules; thrash still visible on host process until then.
- Orchestrator strengthened beyond first implement pass: defer rehome + monitors-changed queue + fresh-display no-op (see REGRESSIONS R017).
- Without quiet baseline, classify → thrash/H1 (safe). Connector hosts → retile when quiet set.
- Nest empty-desk scale apply: H1 settle, no entered-monitor pile (good for race); full dual-window nest smoke still optional.

### Orchestrator / tester session (2026-08-11)

- Root cause proven on host: entered-monitor before thrash-pending; quiet poison → false noop.
- L0: 48 pass (r017+r016+h1+r012+policy).
- Host install + disable/enable **not** enough for tip; nest fresh Shell loads tip.
- Desk restored to default scale + layout dev (structure OK; mon1 order may be tab|term).

### Follow-up (same day): reverse thrash no-scale→default

- Host (tip session): default→no-scale topology OK; **no-scale→default** thrashed (mon0 ghostty→mon1).
- Journal: settle used **`workareas-monitor-recovery` (H1)** both dirs — not retile.
- Nest with tip: `kind=thrash` because **geom: stableKeys rewrite** on scale → lost+gained.
- **Fix:** classify same mon count → **retile** (geom change) / **renumber** (geom quiet); H1 index-before-frame; Meta→tree align; reconfig grace.
- Nest retest: both scale dirs `workareas-settle: kind=retile` + `workareas-retile`.
- L0: 45 pass. Host needs **logout** to load tip for gdisplays both-ways smoke.
- Desk restored: `gdisplays load default` + `forge layout dev`.

### Product locks (unchanged)

| Case | Policy |
| --- | --- |
| Same mon set, geom/scale/pos change | Suppress entered-monitor rehome until workareas settle; settle → **retile** only |
| True mon move (geom quiet) | entered-monitor rehome **still works** |
| Quiet fingerprint | Not updated from snapshot while live ≠ quiet or thrash pending |
