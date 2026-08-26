# forge-layout-slot-machines_sm3-open-into-slot — Bind opens to slot ids

**Status:** done  
**Plan:** [forge-layout-slot-machines](../plans/forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.6 high**  
**Depends:** **SM1 done** (epoch owns mon during open). SM2 done (in-slot hard).  
**Completed:** orchestrator session 2026-08-16; L0 open+hint 81 + SM1/SM2 suites green

## Goal

Apply opens attach **into the desired slot** (skeleton PH or slot id).
Product apply PlaceNext dest is never mon-root-only (D042).

## Acceptance

- [x] ApplyLayout spawn PlaceNext dest = PH node / slot path from the
      desired forest, not monitor-root + later belt
- [x] D034 chrome-family **serialize opens** still holds
- [x] Shared TABBED/STACKED: members target the **same CON/PH**, not N
      mon-root hints
- [x] Placeholder taxonomy: reuse skeleton PH; do **not** invent a
      fourth PH kind. AC4 thrash-isolate and D006 fail-open stay distinct
- [x] L0: dest is slot/PH; mon-root-only apply open is a failed unit
- [x] Belt may still exist until SM6 — do not rely on it for happy-path
      apply place
- [x] Nest dual only if you change mon ownership; default mon=1
      (unit tests sufficient)

## Context for the next agent

### Paths

| Concern | Path |
| --- | --- |
| Dest contract | `lib/shared/layout-open.js` `applyPlaceNextOptions` / `findLayoutSlotDest` / `placeNextDestKind` |
| Open | `lib/extension/layout-apply-open.js` `spawnOne` |
| PlaceNext | `place-hint.js` re-exports dest kind · `window.js` `placeNext` **untouched** |
| PH | reuse skeleton PH via `collectLayoutSlotPlaceholders` — no fourth kind |
| Optional dest forest | `deps.desiredForest` else `snapshotForest` (tests: dest vs residual) |

### Tests

```bash
npm test -- tests/unit/extension/layout-apply-open.test.js \
  tests/unit/shared/layout-open.test.js \
  tests/unit/extension/place-hint.test.js
```

### Do not

- Start SM4
- Delete belt here (SM6)
- Parallel chrome-family opens
- Call `_layoutOp`
- Personal role branches

## Session note

**2026-08-16 SM3 done (4.6 high).** Status: **ready** for orchestrator review.

**Changed**
- `layout-open.js`: dest contract — `isMonRootTreePath`, `placeNextDestKind`
  (`slot` \| `mon-root` \| `none`), `placeNextHasSlotDest`,
  `collectLayoutSlotPlaceholders`, `findLayoutSlotDest`,
  `applyPlaceNextOptions`. TABBED/STACKED same-slot members dest to the
  **first PH in that CON**. Mon-root `treePath` stripped from apply dest.
  `findLayoutPlaceholderId` still role-own PH (bind), not shared dest.
- `layout-apply-open.js` `spawnOne`: dest via `applyPlaceNextOptions`.
  Mon-root-only → fail unit, **no** PlaceNext, **no** spawn. Optional
  `deps.desiredForest` (else snapshotForest).
- `place-hint.js`: re-export dest kind. `window.js` placeNext / SM1
  rehome/epoch **not** edited.

**Proven (all green)**
```
npm test -- tests/unit/extension/layout-apply-open.test.js \
  tests/unit/shared/layout-open.test.js \
  tests/unit/extension/place-hint.test.js
# 3 files / 81 tests (open 13 + layout-open 36 + place-hint 32)

npm test -- tests/unit/extension/layout-apply-epoch.test.js \
  tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/layout-apply-run.test.js \
  tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js
# 4 files / 94 tests (epoch 6 + settle 36 + run 32 + H1 20)
```

**Residual**
- Happy-path dest needs skeleton PHs in dest forest (real apply: after
  skeleton). Empty/no-PH snapshot is a failed dest unit by contract.
- Belt still present until SM6 — not used for apply place.
- Host R036 cold still needs logout (human). Do not claim cold PASS.
- Nest not run (mon ownership unchanged).

**SM4 must not stomp**
- Do not PlaceNext apply dest as mon-root (`moNwsW` / monitor-only).
- Do not dest TABBED/STACKED peers to N mon-root hints — same CON/PH.
- Do not invent a fourth PH kind; reuse skeleton PH.
- Leave `findLayoutPlaceholderId` as role-own PH (bind).
- Leave SM1 epoch begin/end + SM2 in-slot hard / `hard-failed` Done.ok.
- Chrome-family opens stay serialized (D034).
