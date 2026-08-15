# forge-container-insert-a — slot-split insert + edge drop (D032)

**Status:** ready (L0 + nest green; host desk needs logout for tip)
**Plan:** [forge-container-insert-dnd-design](./forge-container-insert-dnd-design.md)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-14 (R028 live + late-identity wrap)

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
- [x] Nest live on new JS — focus left slot + Nautilus is VSPLIT of that
      slot, not 3-wide MONITOR HSPLIT
- [ ] Host `layout dev` + left-dock Nautilus after **logout** (loads
      late-identity wrap tip)

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
- `wm._unknownOpenIdentity` — null/empty class or title at map.
  `trackWindow` still slot-splits (R028). Percent / open-commit still
  wait for `willTile`.
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
npm test -- tests/unit/window/WindowManager-insert-slot-split.test.js \
  tests/unit/window/WindowManager-open-app-policy.test.js \
  tests/regression/bug-482-late-wmclass.test.js \
  tests/regression/bug-r029-late-title.test.js
```

All green this session (10 insert-slot-split including late-identity).

### Risks

- Host Wayland Shell needs logout (or nest) to load tip after install.
  Nest already proved VSPLIT with the late-identity wrap.
- Do not implement TD1 strip-index reorder, peel Model B, or keyboard
  no-auto-pop here.

## Session note

**2026-08-14 R028 live (host tip `g4b2a374`):** After `layout dev`, LFT
on left TABBED Grok (`2946577601`), `forge launch nautilus` → **FAIL**.
Phase: `trackWindow` insert. Nautilus TILE `2946577645` as **3rd even
HSPLIT sibling** of `mo0ws0` (`path=mo0ws0/2`).

Before:

```text
mo0ws0 HSPLIT
  CON TABBED lastTabFocus=Grok 2946577601 [Chrome 2946577600, Grok]
  WINDOW Ghostty 2946577603
```

After (host old JS):

```text
mo0ws0 HSPLIT
  CON TABBED [Chrome 2946577600, Grok 2946577601]
  WINDOW Ghostty 2946577603
  WINDOW Nautilus 2946577645 TILE   # 3-wide even
```

Trace: `layout-track: attached class=null title=null dest=mo0ws0`.
`isFloatingExempt` (null class/title) set `willTile=false` → D032 wrap
skipped → `processFloats` tiled in place.

**Fix:** slot-split when `willTile || _unknownOpenIdentity`. L0
`late null class/title still slot-splits` green. `./install` + nest
(mon=1) **PASS** on `g22c02e7-dirty`:

```text
mo0ws0 HSPLIT
  CON VSPLIT [TextEditor TILE, Nautilus TILE]
  CON VSPLIT [eog TILE, Calculator FLOAT]
```

Nautilus `path=mo0ws0/0/1`, parent VSPLIT, monitor still 2 children.
Nest stopped. Host desk still old tip — logout then re-smoke
`layout dev` + left-dock. Do not start TD1 from this task.
