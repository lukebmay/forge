# Plan: Browser-like tab chrome drag

**Status:** TD1 **done** (code + nest live); TD2–TD4 triage in tab D0  
**Priority:** P1 product chrome — next batch via [tab planning](../tasks/forge-tab-work-planning.md)  
**Created:** 2026-08-06  
**Updated:** 2026-08-16  
**Branch:** `master` (do not open `plan/forge-tab-chrome-drag`)  
**Locks:** [insert + drag table](../tasks/forge-container-insert-dnd-design.md)
(D032) · D023 child list · D024 drop-intent · D025 reveal

### Session note (overwrite)

**2026-08-16:** Further tab work (TD2–4, hover-spinner residual, cross-mon)
goes through [tab planning](../tasks/forge-tab-work-planning.md) with a
high-reasoning model **before** implement. Do not start tab code until that
locks.

**2026-08-14 (TD1 live PASS):** Nest tip `gb280f94` — 3 zenity TABBED,
strip reorder middle→end, peel → mon HSPLIT + 2-tab remainder. Host
pointer smoke not run (no xdotool; Shell.Eval off). Task →
[completed](./completed/forge-tab-chrome-drag_td1-strip-reorder.md).
Do not invent a second DnD engine. TD2 only if peel Model B mismatch.

**2026-08-14 (TD1 code):** Strip reorder in `drag-drop.js`
(`tabStripInsertIndex` + arm/motion/release). L0 131 green.

**2026-08-06:** Mouse tab drag was not browser-like. LX4 landed
unit-level tab→grab-tile plumbing.

---

## Why

Expected UX (browser tab model + locked drag table):

| Gesture | Intent | Today |
| --- | --- | --- |
| Drag tab **along the strip** | **Reorder** siblings in that TABBED/STACKED CON (`replaceChildren`); percents travel | Missing — after 8px becomes window grab |
| Drag tab **off** the strip onto a tile CENTER | **Join** (`mergeWindowsIntoGroup`) | LX4 grab + D024 |
| Drag tab/window onto a tile **edge** | **Slot-split** the target (D032) | LX4 + insert A |
| Drop on empty monitor | Leaf-only (R022) | shipped |
| Peel with no target | Model B wrap-in-slot (locked) | LX4 edge wrap path |
| Click without drag | Reveal only (`revealGroupChild`) | LF2 + R025/R026 |

Window titlebar grab already does join / slot-split / empty-mon.
Tabs must **reuse** that path when the pointer leaves the strip.

## Depends on (do not start TD1 early)

1. Insert A **code** is in tree (done). Live R028 smoke **should**
   be done first so leftover wrap is not confused with tab peel.
2. **R025 + R026 live** — same tab actors / `revealGroupChild`.
   TD1 will touch `tree.js` tab press + `drag-drop.js`. Shipping
   reorder on a tip that still fails click-to-stay is wasted work.
3. Named APIs already exist — do not wait on FCC Wave C or
   container-motion HTML prototype. The drag **table is locked**.

## Non-goals (v1)

- Cross-mon TABBED as a product (separate D0).
- Firefox pinned tabs / OS-level tear-off windows.
- Replacing keybind move/swap.
- New drop-zone geometry (use `drop-zones.js` / `drop-intent.js`).
- Layout CLI / ApplyLayout changes.
- STACKED chrome polish beyond “same as TABBED strip.”

## Tasks

| ID | Work | Agent | Status |
| --- | --- | --- | --- |
| **TD0** | Live inventory on tip: LX4 grab from a tab vs titlebar (join / edge / empty mon). Write 10-line note in this file if anything differs | `grok-4.5` low, or skip if operator already knows grab works | draft |
| **TD1** | Strip reorder — [completed](./completed/forge-tab-chrome-drag_td1-strip-reorder.md) | `grok-4.5` medium | **done** (code + nest live) |
| **TD2** | Peel-out — **only** if TD0/TD1 shows LX4 edge wrap ≠ locked Model B | `grok-4.6` | later / maybe skip |
| **TD3** | Join another strip — **only** if LX4 CENTER miss | `grok-4.5` medium | later / maybe skip |
| **TD4** | User docs + cheatsheet one-liner | `grok-4.5` low | after TD1 |

---

## TD1 — Reorder within strip (implementer spec)

**Agent:** `grok-4.5` as 4.5 **medium**. One session. If you need a
new drop-intent rule or a second grab path, **stop** and escalate
(`grok-4.6`).

### Behavior

1. Primary press on a tab (not close): still `revealGroupChild`
   (click) + arm gesture (already LX4).
2. Pointer travels ≥ `TAB_DRAG_THRESHOLD_PX` **and stays over the
   same group's tab strip** (union of sibling tab actors, or the
   decoration strip actor): **reorder mode**.
   - Compute insert index from pointer X (TABBED row) or Y
     (STACKED). Pure helper — unit-test it.
   - Preview: CSS class / gap on the strip (no tile drop-zone
     preview).
   - Release: `parent.replaceChildren(newOrder)` (D023). Same
     parent, same layout. Percents stay on the nodes.
   - Open leaf / pin: if the dragged child was the pin or open
     leaf, it stays that child (do not reveal a different tab as a
     side effect of reorder).
3. Pointer **leaves** the strip: switch to existing grab-tile
   (`_startTabMoveGrab`) and the normal window drop-zones. Do not
   keep a parallel commit path.
4. Short click (< threshold): no reorder, no grab (today).

### Files

- `lib/extension/drag-drop.js` — arm / motion / commit; add
  `tabStripInsertIndex` (or similar) **pure**.
- `lib/extension/tree.js` — tab press already arms; may need a
  “strip actor” hit test helper.
- `lib/extension/decoration.js` — only if the strip is a decoration
  container you must hit-test (prefer existing tab actors).
- Tests: `tests/unit/window/WindowManager-drag-drop*.test.js` and/or
  a new `tests/unit/extension/tab-strip-reorder.test.js`.

### Do not

- Call `createNode` / even 3rd H/V sibling / `mergeWindowsIntoGroup`
  for in-strip reorder.
- Assign `childNodes` outside Node methods.
- Bypass `revealGroupChild` for the initial click.
- Change `dropChangesStructure` unless a unit proves same-strip
  reorder is misclassified as wrap (then extend that function, do
  not add `_isNoOpDrop`).
- Touch `scripts/forge/layout_*.py` or `cli/`.

### Accept

- [x] Drag tab along strip → child order changes; group layout
      stays TABBED/STACKED (unit)
- [x] Percents / slot size of the group unchanged (unit)
- [x] Drag tab off strip onto another tile CENTER still joins
      (existing LX4 path; leave-strip → grab unit-tested)
- [x] Click without drag still R025/R026 (arm path unchanged)
- [x] L0: `npm test --` tab-drag + drag-drop + reveal/pin + strip-reorder
- [ ] Live (after `./install` + nest or logout): 3-tab group,
      reorder, then peel one onto an edge (slot-split)

```bash
npm test -- tests/unit/extension/drop-intent.test.js \
  tests/unit/window/WindowManager-drag-drop.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-tab-drag.test.js \
  tests/unit/extension/layout-open-leaf-pin.test.js
```

(Adjust the tab-drag test path if the file name differs; glob
`**/*tab-drag*`.)

---

## Related

- LX4 completed (unit):
  [forge-layout-live-x11_lx4-tab-drag](./forge-layout-live-x11/completed/forge-layout-live-x11_lx4-tab-drag.md)
- Insert / drag lock:
  [forge-container-insert-dnd-design](../tasks/forge-container-insert-dnd-design.md)
- Do not mix: [forge-layout-in-process](./forge-layout-in-process.md),
  [FCC Wave C](./forge-first-class-containers.md)
