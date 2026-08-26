# Tab-drag residuals — PR12–PR14 plan

**Status:** ready for acceptance (implement after approve)
**Date:** 2026-08-17
**Authority:** grok-4.6 xhigh diagnosis + host eyes-on (logout confirmed)
**Plan home:** [agents/plans/forge-tab-click-drag.md](agents/plans/forge-tab-click-drag.md)
**Branch:** `master` (uncommitted PR6–PR11 already on tip)

## Verdict up front

| Bug | Product intent | Cause class | Fix slice |
| --- | --- | --- | --- |
| 1 Gap does not shrink with chip; remaining overflow | Gap == chip; remaining equal-fill `(strip − chip)` | Dual layout: `set_width` + BoxLayout reflow **and** `translation` from stale `homeStart` | **PR12** |
| 2 Non-dragged tabs overlap | Siblings never share a slot | Same as #1 | **PR12** (do not split) |
| 3 Tab cannot hit app drop zones | Leave strip → MOVE APP → same zones as titlebar | Peel tears chip down; synthetic path drops event coords → pointer falls back into origin frame | **PR13** |
| 4 Cannot leave origin strip / cross-mon | Leave strip is product **now** (not a v1 deferral) | Same peel/pointer class as #3; D044 only forbids spanning chrome | **PR13** + prove **PR14** |

**Tip-load:** Ruled out as the primary explanation. Operator logged out after install; host `gnome-shell` started after install mtime; installed `drag-drop.js` byte-matches workspace (PR11 symbols present). These are live tip bugs.

---

## Product locks (do not re-litigate)

- One DnD engine (`drag-drop.js`); no second engine; never `_layoutOp`
- Peel ownership stays Forge **synthetic** `GRAB_TILE` (PR10) — do not call `begin_grab_op` for St chrome
- Foreign mid-grab stays **spacer-only** (PR9) — no live-tab reparent onto foreign strip
- D044: mon-local groups; cross-mon = peel then zones / empty-mon / **move-then-join**
- Tree mutate only on release (`replaceChildren` / `moveWindowToPointer`)
- Float+gap centerline REORDER while pointer is in a strip band

**#4 is not intentional first-step design.** Staying REORDER while the pointer is still in the origin strip band **is** intentional. Being unable to leave that band is a bug.

---

## Cause graph

```text
host tip (PR6–PR11 loaded)
    │
    ├─ REORDER visual
    │     PR11 set_width + reparent chip + insert spacer
    │   + PR4 translation from pre-drag homeStart
    │   + St.BoxLayout end-of-frame reallocate
    │         → painted x = new allocation + old-home translation
    │         → #1 overflow / “gap looks huge” + #2 overlap
    │
    └─ MOVE APP / peel
          _startTabMoveGrab tears float chip back onto strip
          noteTabDragMotion drops x,y → getDragPointer / get_pointer
          parked pointer → inside unmoved origin frame
                → #4 “can’t leave bar” feel + #3 no useful zones/commit
          titlebar path immune (Mutter moves the frame)
```

---

## PR12 — One mid-drag layout owner (bugs 1 + 2)

**Agent:** 4.5 **high** (implement; architecture already locked by this plan)
**Depends:** nothing (tip confirmed)
**Goal:** During REORDER (and foreign spacer preview), gap axis size == chip; remaining equal-fill `(available − chip)`; **no sibling overlap / strip overflow**.

### Preferred approach (recommended)

**BoxLayout-only for in-strip remaining:**

1. Keep chip reparented to tab-chrome layer (float under pointer).
2. Keep chip-sized gap spacer in the strip host; place by child index.
3. Keep `_applyReorderSnapSize` / `tabStripEqualFillSizesWithGap`.
4. **Force `translation_x/y = 0`** on remaining during the gesture (or stop calling `_easeTabTranslation` when the host is a live BoxLayout that reallocates).
5. Sibling “slide” = move spacer index in the host (optional short ease of spacer only / child order), not dual geometry.

### Rejected for this slice

- Keep both `set_width` **and** `homeStart`-based translation (current PR11+PR4 combo).
- A second sizing brain outside `tabStripEqualFillSizesWithGap`.

### Also harden

- `_applyDecorationRect` must not `add_child` a floating chip back onto the strip while `_tabDrag.reorder` / `chipFloating` (mid-gesture steal).
- Peel hit-band for later PR13: prefer frozen strip geometry over live decoration `get_transformed_size` if decoration AABB is inflated — document if deferred into PR13.

### Acceptance

- [ ] Unit: mock that **reallocates** on `remove_child` / `set_width`; assert painted ranges (`allocation + translation`) are **disjoint**; `sum(remaining) + chip ≤ strip + ε`
- [ ] Unit: gap spacer axis size == `chipW`/`chipH` after enter REORDER and after gap moves
- [ ] Same-strip + STACKED + multi-row gap row still green
- [ ] Foreign spacer-only still uses same equal-fill path; no live reparent
- [ ] PR8 post-commit/cancel restore (`set_width(-1)`, expand, `commitLayout`) unchanged
- [ ] PR10 synthetic peel entry untouched
- [ ] L0: `tab-strip-reorder` + Tree-layout + tab-drag + DnD comprehensive + normalize + Tree-ops
- [ ] Nest mon=1 eyes-on: hole tracks chip; siblings never overlap

### Files

- `lib/extension/drag-drop.js` — `_applyTabReorderGapVisual`, `_equalFillReorderSiblings`, `_easeTabTranslation` usage
- `lib/extension/tree.js` — only if chip re-attach guard needed
- `tests/unit/extension/tab-strip-reorder.test.js` — reallocating mock + painted-range asserts

---

## PR13 — Peel MOVE APP that can place (bugs 3 + 4)

**Agent:** **4.6 high** (same failure class as PR10)
**Depends:** PR12 settled (serial on `drag-drop.js`)
**Goal:** Leaving every strip band enters MOVE APP that paints five-zones on other tiles and commits edge/CENTER/empty-mon like a titlebar grab.

### Approach

1. Keep `_startTabMoveGrab` → `_beginSyntheticTabMove` → `_handleGrabOpBegin` (synthetic forever).
2. On peel: **do not** full-teardown the float chip. Clear origin gap/spacer only; keep chip (or equivalent ghost) under the pointer until release/abort.
3. One coordinate owner: while `state.synthetic`, `noteTabDragMotion(x,y)` must feed those coords into `_handleMoving` / `getDragPointer` (do not discard `x,y` and rely on parked `global.get_pointer()`).
4. Peel band = frozen strip geometry (siblingSnap / planned bar), not an inflated live decoration transform that traps the pointer forever.
5. Commit path unchanged: `finishTabDragRelease` → `_endSyntheticTabMove` → `_handleGrabOpEnd` → `moveWindowToPointer` / `_commitForeignStripJoin`.
6. Optional Meta frame free-float remains deferred if chip-follow is enough for zones+commit.

### Acceptance

- [ ] Peel south of strip → `GRAB_TILE` + chip (or ghost) still under pointer
- [ ] Five-zone paint on a **different** TILE (not self / not origin strip only)
- [ ] Release CENTER or edge changes structure (same as titlebar)
- [ ] `begin_grab_op` still not called for tab chrome peel
- [ ] Foreign preview still spacer-only mid-grab
- [ ] Unit: synthetic peel + event coords → zone path / commit; peel AABB excludes chip and does not use stage-sized decoration
- [ ] Nest mon=1: peel → zones → edge/CENTER place
- [ ] L0 suite green (same bags as PR12 + peel cases)

### Files

- `lib/extension/drag-drop.js` — `_startTabMoveGrab`, `_teardownTabReorderPreview` split, `noteTabDragMotion`, `_handleMoving`, `getDragPointer` (or synthetic pointer stash), `_tabDragPointerOnStrip`
- `tests/unit/extension/tab-strip-reorder.test.js`
- `tests/unit/window/WindowManager-tab-drag.test.js`
- `tests/unit/window/WindowManager-drag-drop-comprehensive.test.js`

---

## PR14 — Cross-mon / foreign prove

**Agent:** 4.5 med
**Depends:** PR13
**Goal:** Prove product paths that were unreachable while peel was blind — not a new engine.

### Acceptance

- [ ] Nest `--monitors=2` (or host after tip): peel to empty other mon commits (R015/R022)
- [ ] Peel onto foreign strip on other mon → spacer preview + D044 join-at-index
- [ ] No Shell freeze; no spanning chrome
- [ ] Stop nest when done

---

## Out of scope / later

- PR7 docs (after feel is true)
- Meta frame free-float polish if chip-follow already makes zones/commit honest
- Live foreign chip reparent mid-grab (rejected; PR9 spacer-only)
- FCC C2+, STACKED product redesign, wrap chevron/scroll

---

## Do not

- Invent a second DnD engine
- Reopen `begin_grab_op` for tab chrome
- Reparent live tab onto foreign strip mid-grab
- Call `_layoutOp` / flatten; spanning tab chrome
- Split bugs 1 and 2 into separate PRs
- Start PR14 before peel works
- Trust width-only unit asserts as proof of host paint

---

## Implementation order after acceptance

1. Write task notes under `agents/plans/forge-tab-click-drag/` for PR12 (then PR13).
2. Update `agents/PRIORITY.md` + `agents/HANDOFF.md` active queue to PR12→PR14.
3. Implement PR12 → L0 → nest mon=1 visual check.
4. Implement PR13 (4.6 high) → L0 → nest peel→zones.
5. PR14 dual-mon prove.
6. Host eyes-on checklist for operator.

## Retest commands

```bash
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/tree/Tree-layout.test.js \
  tests/unit/window/WindowManager-tab-drag.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-normalize-group-home.test.js \
  tests/unit/tree/Tree-operations.test.js

./install --kit=vim
./scripts/forge/forge-test nested run --monitors=1 -- bash -lc \
  'env FORGE_JOB=0 forge layout _forge-test-clean'
# dual only for PR14:
# ./scripts/forge/forge-test nested run --monitors=2 -- …
./scripts/forge/forge-test nested status   # running: False
```
