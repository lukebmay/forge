# forge-container-insert-a — slot-split insert + edge drop (D032)

**Status:** ready
**Plan:** [forge-container-insert-dnd-design](./forge-container-insert-dnd-design.md)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13 (R028 leftover wrap + batch skip)

## Goal

New tiled windows and same-axis edge drops **slot-split the focused /
drop-target unit** when that unit’s H/V parent already has siblings.
Never an even 3-way (or 4-way) H/V sibling list unless the user resized
or ran `window-reset-sizes`.

## Acceptance

- [x] Named API on tree/WM for slot-split wrap; catalog row in
      `docs/dev/contracts.md`
- [x] 3rd tiled open on `MONITOR HSPLIT [A, B]` → wrap focused unit:
      `[A, CON[B, C]]` or `[CON[A, C], B]` — never `[A, B, C]`
- [x] 2nd tiled open on empty mon stays a MONITOR sibling (no extra CON)
- [x] Focus inside TABBED/STACKED: wrap the **bag**, do not join as a tab
- [x] Same-axis edge drop onto a target whose parent already has siblings
      wraps that target (same as A / D029 mismatch wrap)
- [x] Same-axis **reorder** along a sibling row still reorders (does not
      wrap)
- [x] `auto-split-enabled` default stays off; it only adds 1-child
      orientation toggle / quarter tiling
- [x] L0 units green; no personal `dev`/`t1` layouts; nest only if JS
      live-retest is needed (mon=1, `forge nested run`, then stop)
- [ ] Live after nest/logout — `layout dev`, dock Nautilus on left (R028)

## Context for the next agent (complete + succinct)

### Product (D032)

Operator picked **A**. Drag table locked. See the design task.

Percents: wrap keeps the unit’s old `percent` / `userSized`. Children
of the wrap start 50/50 (`insertChildPercent` / `resetSiblingPercent`
on the wrap). Other mon siblings unchanged.

### Code

- `tree.slotSplitUnit` — wrap via `tree.split` when parent is H/V with
  2+ children. 1-child leftover H/V is the slot: join it (retarget
  aspect). No-op wrap for lone child or tab/stack parent.
- `wm.slotSplitForInsert(unit)` — aspect of the unit’s slot rect
  (`aspectOrientationFromRect`). Pass the **resolved** unit (do not
  re-walk after tiny-pane tab wrap).
- `wm._resolveInsertUnit` — bag if LFT parent is tab/stack, else leaf.
- Open (`trackWindow`): resolve unit → auto-split 1-child toggle /
  tiny-pane → `slotSplitForInsert` → attach. Bag attach is
  `unit.parentNode` (wrap CON or mon). `createNode(bag)` is forbidden.
- CL8: skip slot-split when `deferHidden`. Residual rehome
  (`_rehomeAttachAfterMonLft`) uses the same helper.
- `_maybeAspectSplitForOpen`: 1-child H/V toggle + tiny-pane only.
- DnD: same-axis edge + dest 2+ children + **not** same-parent →
  `shouldWrapTargetCon`. Execute uses `slotSplitUnit` / `split(force)`.
  Same-parent reorder still simple-inserts.
- `forge layout` IR unchanged (may still build 3-wide).

### Tests

```bash
npm test -- tests/unit/window/WindowManager-open-app-policy.test.js \
  tests/regression/bug-r021-r024-open-drop-layout.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-insert-slot-split.test.js \
  tests/unit/tree/Tree-operations.test.js \
  tests/unit/extension/drop-intent.test.js \
  tests/regression/bug-r015-empty-mon-dnd.test.js
```

All green this session (plus drag-drop, open-commit, mhje, tnth).

### Risks

- Host tip does not include this JS until `./install` + nest or logout.
- Do not implement TD1 strip-index reorder, peel Model B, or keyboard
  no-auto-pop here.

## Session note

**2026-08-13 R028:** Live `layout dev` + left-dock Nautilus was 3-wide
even HSPLIT. Root: leftover 1-child H/V + attach to MONITOR; CL8
skipped wrap mid-batch; orientation used a stale wide frame. Fix: join
leftover 1-child H/V as the slot (retarget aspect); D032 still runs
mid-batch; orientation from `unit.rect`. L0 leftover join + batch +
slot-rect. Live still needs `./install` + nest or logout.
