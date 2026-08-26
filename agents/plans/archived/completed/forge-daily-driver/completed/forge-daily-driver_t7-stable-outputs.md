# Task — T7: Stable monitor output keys + remap

**Status:** Done (A/B **AGREE**)  
**Plan:** [forge-daily-driver.md](../../forge-daily-driver.md) Phase E  
**Analysis:** [forge-layout-thrash-analysis.md](../../forge-layout-thrash-analysis.md) § Q3  
**Priority:** P1  
**Kind:** Plan-linked

## Problem

Tree nodes and T6 forest snapshots key monitors by **volatile index**
(`mo${index}ws${ws}`). After connector reorder / hybrid thrash, the same physical
display may get a new index → soft rehome and snapshot remap can still attach
structure to the wrong head. gdisplays owns connector identity in shellrc; Forge
must **not** import Python — only a light GJS remap layer.

## Goals

1. **Stable output fingerprint** per live monitor (best-effort from Mutter/GJS):
   prefer connector name / display name; fall back to geometry + primary + index.
2. **Remap table:** `stableKey → current monitor index` (and reverse) built at
   settle / monitors-changed.
3. **Integrate with T6:** forest mon descriptors store `stableKey` (keep `id`
   index form for compat); restore/`resolveTargetMonitor` prefer stableKey match
   when available.
4. **Soft rehome / last-good homes:** optionally tag homes with stableKey so
   rehome survives index renumber (when key still resolves).
5. Pure helper module unit-testable without live Shell; thin hooks in
   MonitorManager / WindowManager.
6. Docs: DESIGN + monitors.md note on identity boundary (gdisplays vs Forge).
7. No gdisplays import; no disk session profiles; no FC CLI.

## Acceptance

- [x] Pure module builds fingerprints + remaps oldIndex/stableKey → new index
- [x] T6 mon descriptors include stableKey when capturable; restore uses it
- [x] Index renumber with same connector set remaps structure to correct mon
- [x] Fallback when connector unknown (geometry/primary/index) does not crash
- [x] Unit tests pass; `npm test` green
- [x] Docs state shellrc/gdisplays boundary
- [x] No Python; no disk workon files

## Out of scope

- Full EDID/vendor matching parity with gdisplays
- Writing monitors.xml / calling gdisplays
- FC* forge CLI
- Disk layout persistence

## Session note

**T7 implement (Task Force A, 2026-07-25):**

Shipped pure `lib/extension/monitor-identity.js` (`fingerprintMonitor`,
`buildLiveMap`, `remapIndex`, `resolveIndexByStableKey`, mon-ws helpers). Key
formats: `conn:…` → `name:…` → `geom:x,y,w,h[#primary]` (+ `#idx:N` only on
collision). `MonitorManager.collectLiveMonitorsInfo` best-effort from
`global.display` + optional `Main.layoutManager.monitors` connector/name.
WindowManager caches live map; refresh on enable, soft-rehome settle (after
forest snapshot so quiet-time keys stick), and `layoutManager::monitors-changed`.
T6 monDesc optional `stableKey`; `resolveTargetMonitor` prefers stableKey when
`moN` is stale. Last-good homes store `stableKey`; soft rehome resolves key
first. Docs: DESIGN T7 section + monitors.md identity boundary.

**Tests:** `monitor-identity.test.js` + T7 cases in `tree-snapshot.test.js`.
`npm test` **1741** green.

**B: AGREE** (1741 green). Soft rehome snapshot-before-refresh confirmed.
Next: **FC\*** forge CLI (`forge-command.md`).
