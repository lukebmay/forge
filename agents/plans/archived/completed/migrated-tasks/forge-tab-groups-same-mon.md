# forge-tab-groups-same-mon — Mon-local TABBED/STACKED (D044)

**Status:** done
**Plan:** (none) — lock:
[tab D0](../forge-tab-work-planning.md) ·
[cross-mon D0](../forge-tab-groups-cross-mon_d0-discussion.md) ·
[D044](../../../docs/DECISIONS.md)
**Branch:** master (default)
**Blocker:** (none)
**Priority:** shipped
**Updated:** 2026-08-16
**Agent:** Grok 4.5 high

## Goal

TABBED/STACKED CONs stay on **one monitor**. Mixed-mon members are a
defect: rehome every WINDOW descendant onto the CON’s MONITOR ancestor
and **keep the group**. Join across mons is move-then-join onto dest.
Do not draw spanning chrome.

## Acceptance

- [x] Named home API (extend existing MONITOR-ancestor walk — see
      Context). Catalog row in [contracts.md](../../../docs/dev/contracts.md)
- [x] `mergeWindowsIntoGroup` / `window-merge-group` / session
      `merge-group`: dest = focus (or drop-target) mon; partner rehomes
      there then merges. Workspace-wide `get_tab_next` must not leave a
      straddling CON
- [x] DnD CENTER already grab-tiles onto dest — assert + unit that
      cross-mon CENTER is one TABBED on dest, not two mons
- [x] Idle / post-commit normalize: mixed-mon TABBED/STACKED → rehome
      members to CON MONITOR ancestor; layout stays TABBED/STACKED;
      open leaf / pin unchanged
- [x] Keyboard mon-move of **one** tab still peels that leaf (LX3);
      remainder stays on source. Do not migrate the whole CON
- [x] H1 `alignMonitorRecoveryGroupTargets` + R016 mon-loss collect
      **unchanged** (survival, not span)
- [x] No profile span sugar; no `sameParentMonitor` Meta twin as home
- [x] L0 units below green. Nest `--monitors=2` only if JS live-retest
      is needed; then `forge nested run` + stop. No personal `dev`/`t1`

## Context for the next agent (complete + succinct)

### Shipped APIs

| Job | API |
| --- | --- |
| Group home mon | `tree.groupHomeMonitor(con)` → tree MONITOR index |
| Normalize one group | `wm.normalizeGroupToHomeMonitor(con)` — Meta→home; keep group |
| Normalize all | `wm.normalizeTabGroupsToHomeMonitors()` (render idle; skip apply/grab) |
| Merge | `mergeWindowsIntoGroup` reparents partner under focus mon; `_afterMergeGroup` normalizes |

### Paths

- `lib/extension/tree.js` — `groupHomeMonitor`, merge + `_afterMergeGroup`
- `lib/extension/window.js` — normalize + renderTree hook
- `lib/extension/command.js` — WindowMergeGroup same-mon prefer + normalize
- `lib/extension/session-api.js` — merge-group normalize
- `lib/extension/drag-drop.js` — CENTER normalize
- `docs/dev/contracts.md` — home + normalize rows

### L0

```bash
npm test -- tests/unit/tree/Tree-operations.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-normalize-group-home.test.js \
  tests/regression/forge-lx3-cross-mon-move.test.js \
  tests/regression/bug-h1-monitor-recovery-workareas-thrash.test.js
# 159 green
```

### Residual

- Nest dual-mon live not required for this slice (structure unit-proven).
- FCC C4 whole-group mon move still later.
- TD4 docs one-liner still deferred.

## Session note

**2026-08-16:** D044 implemented. Home + normalize named APIs; merge-group
move-then-join onto focus mon; DnD CENTER cross-mon unit; LX3 peel unit;
H1/R016 untouched. L0 159 green. No nest.
