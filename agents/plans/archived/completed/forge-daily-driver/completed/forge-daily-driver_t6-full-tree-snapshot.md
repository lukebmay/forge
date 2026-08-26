# Task — T6: Full in-memory tree snapshot

**Status:** Done (A/B **AGREE** after rework)  
**Plan:** [forge-daily-driver.md](../../forge-daily-driver.md) Phase E  
**Analysis:** [forge-layout-thrash-analysis.md](../../forge-layout-thrash-analysis.md) § Q3  
**Priority:** P1  
**Kind:** Plan-linked

## Problem

Today only **outer STACKED/TABBED** groups are snapshotted around `reloadTree`
and soft rehome (`snapshotLayoutGroups` / `restoreLayoutGroups*`). Nested H/V
splits, sibling **order**, **percents**, and **userSized** are lost on rebuild —
complex layouts degrade after thrash even when windows rehome correctly.

Product order (analysis): full **in-memory** snapshot first; disk / stable mon
keys later (T7 + workon).

## Goals

1. **Serialize full tree topology in memory**: per monitor/workspace (or whole
   forest): CON layouts (H/V/TABBED/STACKED), child order, percents,
   `userSized`, `lastTabFocus`, WINDOW leaves by live Meta.Window ref.
2. **Restore** from snapshot after flat rebuild / thrash when windows still
   resolve; collapse degenerates (closed windows); preserve size policy where
   survivors allow.
3. Prefer **pure helper** (e.g. `lib/extension/tree-snapshot.js`) unit-testable
   without full Mutter when possible; thin hooks on Tree/WindowManager.
4. Wire into existing thrash paths: soft rehome and/or `reloadTree` (extend or
   complement layout-group snapshot — do not break forge-bqa tab restore).
5. Keep LFT MRU coherent after restore (re-touch surviving focused tile if
   needed; do not invent disk keys).
6. Unit/regression tests; `npm test` green.
7. Short DESIGN + plan note; no disk file, no T7 connector identity.

## Code touch list (expected)

| Area | Notes |
| --- | --- |
| New `lib/extension/tree-snapshot.js` (or Tree methods) | capture / apply full descriptor |
| `lib/extension/tree.js` | export hooks; may keep layout-group as subset or delegate |
| `lib/extension/window.js` | soft rehome / reloadTree use full snapshot |
| Tests | nested H/V + tabs; percents/userSized; missing window collapse; reload path |
| `docs/DESIGN.md` | brief why full snapshot vs layout-group only |

## Acceptance

- [x] Snapshot captures H/V + tab/stack + order + percent + userSized + window refs
- [x] Restore rebuilds nested structure for surviving co-located windows
- [x] Closed/missing windows collapse without crash; partial cohort OK
- [x] Soft rehome and/or reloadTree use full snapshot (tabs still survive)
- [x] Existing layout-group behavior not regressed (forge-bqa class cases)
- [x] Unit tests pass; `npm test` green
- [x] No disk persistence; no T7 stable mon keys; no forge CLI

## Out of scope

- Disk session files / `workon` profiles
- T7 connector/role remap
- Flex engine / pin-to-tile
- OP-opt tiny-pane

## Session note

**2026-07-25 (Task Force A rework — B DISAGREE fixes):**

### Fixed (B findings)

1. **Mon-agnostic tab/stack recovery (blocking):**
   - `resolveTargetMonitor` — prefer snapshot mon if survivors still there; else
     majority mon of cohort (layout-group style).
   - `applyMonitorSnapshot` — pure mon full-replace; mixed mon cohort-only splice
     so foreign windows are not wiped; mon-level insert index for nested cohort.
   - `pruneEmptyConsUnder` after restore so hollow TABBED/STACKED on abandoned mon
     do not linger.
2. **Mon-level percent renormalize** after collapse (`renormalizeChildPercents` on
   rebuilt mon children in `applyMonitorSnapshot`).
3. **Tests:** cross-mon TABBED flatten → restore; soft rehome path with pre-thrash
   forest; mon-level percent collapse. forge-bqa + H1 intact CON still green.
4. **Comment:** soft rehome → `reloadTree` takes a **fresh** snapshot; does not
   reuse the soft-rehome capture.

### Files

- `lib/extension/tree-snapshot.js` — remap, mixed apply, prune, mon-level renorm
- `lib/extension/window.js` — soft-rehome comment / log only
- `tests/unit/extension/tree-snapshot.test.js`
- `tests/regression/bug-h1-soft-rehome-workareas-thrash.test.js`
- `docs/DESIGN.md` — mon remap + reloadTree fresh snapshot

### Tests

- `npm test` **1725 passed**. No commit.

### Residual risks

- Soft rehome still snapshots **at settle** (post-thrash). If thrash already
  flattened before settle and nothing preserved structure earlier, the forest has
  no TABBED to restore — quiet structure snapshot (like last-good homes) is still
  future work.
- Two monDescs remapped onto the same thrash-pile mon can interleave if soft
  rehome fails to split them back; cohort-only apply limits wipe but order is
  apply-order dependent.
- T7 connector identity still separate.

### B round 2: AGREE

Mon-agnostic remap, mon-level renorm, tests green (1725). Residual: settle-time
snapshot if thrash already flattened; T7 connector identity next.

**Next:** T7 stable mon roles / output keys.
