# forge-dual-mon-open-drop-layout — Empty-head open, leaf DnD, nest drop, first layout TILE

**Status:** done
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

Fix four live dual-mon regressions (nautilus open/drag + first
`forge layout dev` FLOAT) at the named contracts, with tests that
encode the **observable tree**, not the current helper’s internals.

## Acceptance

- [x] Open on empty dest mon homes there (not other-mon LFT / end-of-tree)
- [x] Empty-mon drag of a nested leaf moves **only that leaf**
- [x] BOTTOM onto an HSPLIT sibling nests a VSPLIT (not a 3-wide HSPLIT)
- [x] First layout apply paints TILE (leftover freeze / stale render idle
      cannot skip commit)
- [x] L0 tests fail without the fix
- [x] REGRESSIONS R021–R024 + LIVE_CASES tags
- [x] Separate task for test-suite honesty analysis

## Context for the next agent (complete + succinct)

### Why existing tests missed these

| Bug | Nearby tests | Why they stayed green |
| --- | --- | --- |
| Empty-head open | `bug-tnth` claims default `pointer`; OP1 uses LFT; `bug-299` / open-app-policy never put pointer on an **empty** mon | `tnth` “pointer” case has no LFT, so mon0 == pointer by accident. R004 “fixed” dock-miss by `_lastTileOnMonitor` (end-of-tree on the **wrong** mon). |
| Nested empty-mon drag | R015 uses two **flat** mon0 siblings | `_rehomeWindowPreservingContainer` only mis-fires when a VSPLIT sibling’s Meta mon matches dest (after `safeMoveToMonitor` / false-positive `_containerFullyMigrates`). Flat pair has no CON to walk up. |
| BOTTOM nest | comprehensive DnD tests wrap a **CON** HSPLIT, not MONITOR-direct children; they assert `dragged.parentNode.layout === VSPLIT` only | `isMonParent && numWin === 2` reuse never runs in those fixtures. No assertion that the **other** HSPLIT sibling stays out of the new VSPLIT. |
| First layout FLOAT | RunSteps skips `commitLayout` when `_freezeRender` was already on (leftover drag); `renderTree(force)` no-ops if a stale `renderTree` idle occupies the SourceBag slot | Units never start apply with leftover freeze + existing tiles. Second apply works because freeze is gone / windows already TILE in the tree. |

**Pattern:** tests lock the implementation they were written next to
(call order, parent.layout, “homes to mon 0”) instead of the user-visible
forest after the gesture.

### Roots

1. **R021** — `resolveOpenAppPlacement` has no empty-head rule. Dock miss
   + focus/LFT on the occupied mon + `_lastTileOnMonitor` → attach end of
   left tree (aspect-split → “bottom right”).
2. **R022** — `_commitEmptyMonitorDrop` reuses workspace-migration
   `_rehomeWindowPreservingContainer`. User drag of one leaf must not
   walk up a CON.
3. **R023** — `_executeDropOperation` reuses the MONITOR when
   `shouldCreateCon` (orientation mismatch) and `numWin === 2`. That
   flattens the new axis onto all siblings. Monitor default HSPLIT then
   looks like a 3-wide HSTACK.
4. **R024** — RunSteps preserves leftover freeze and skips commit;
   `endOpenLayoutBatch` commits with `force: !layoutController`; force
   `renderTree` drops if the idle slot is already taken. First apply
   can leave mapped geometry (looks FLOAT); second apply paints slots.

### Enable / test

```bash
npm test -- tests/unit/extension/lft-mru.test.js \
  tests/unit/window/WindowManager-open-app-policy.test.js \
  tests/regression/bug-r015-empty-mon-dnd.test.js \
  tests/regression/bug-r021-r024-open-drop-layout.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/extension/session-api-layout-cycle.test.js
python3 -m pytest tests/unit/cli/test_live_matrix.py -q -k "r021 or r022 or r023 or r024 or r015"
```

### Risks

- Empty-head must not steal generic Super+N when pointer is on a
  **tiled** head (OP1 LFT stays).
- Leaf-only empty-mon must not break workspace-change container migrate
  (`_rehomeWindowPreservingContainer` still used there).

## Session note

Shipped on master. D027–D029 + R021–R024.

- Empty-head in `resolveOpenAppPlacement` (after dock + window-actual)
- `_commitEmptyMonitorDrop` leaf-only
- MONITOR `numWin === 2` reuse removed
- RunSteps always unfreeze+force commit; batch end processFloats + force;
  `renderTree(force)` cancels stale idle

L0 green: `bug-r021-r024-open-drop-layout`, nested R015, open-app-policy,
lft-mru, tnth, 299, open-commit, session-api-layout-cycle.

Analysis task:
[forge-test-suite-honest-analysis](./forge-test-suite-honest-analysis.md).

Load tip + live smoke still residual (host dual-mon).
