# forge-tab-chrome-drag_td1-strip-reorder — Reorder tabs on the strip

**Status:** ready — **next new code** after R025/R026 live  
**Plan:** [forge-tab-chrome-drag](../plans/forge-tab-chrome-drag.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-14  
**Agent:** `grok-4.5` as 4.5 **medium**. Escalate to `grok-4.6` if
strip-vs-grab hit testing needs a new drop-intent rule.

## Goal

Dragging a tab **along its own TABBED/STACKED strip** reorders that
group’s children (browser-like). Dragging **off** the strip keeps
today’s LX4 grab-tile (join / slot-split / empty mon).

## Acceptance

- [ ] Pointer stays on the same group’s strip after the 8px threshold
      → child order changes via `parent.replaceChildren` (D023)
- [ ] Group layout stays TABBED/STACKED; percents on nodes unchanged
- [ ] Open leaf / live pin stays the dragged child (no surprise reveal)
- [ ] Pointer **leaves** the strip → existing `_startTabMoveGrab` +
      drop-zones (CENTER join, edge slot-split D032, empty-mon R022)
- [ ] Click without drag still `revealGroupChild` (R025/R026)
- [ ] Close-button path unchanged (no arm)
- [ ] Pure insert-index helper unit-tested
- [ ] Suites below green
- [ ] Live after `./install` + nest or logout: 3-tab group reorder,
      then peel one onto an edge

## Context for the next agent (complete + succinct)

### Do this after

R025 + R026 **live** on tip (same tab actors). Insert A code is
already in tree. Do **not** wait on CLI-node or ApplyLayout.

### Behavior (locked drag table)

See plan + D032. Short click = reveal. Travel on strip = reorder.
Travel off strip = window grab.

### Implementation

1. Pure helper (e.g. `tabStripInsertIndex({ tabs, pointer, axis })`)
   in `lib/extension/drag-drop.js` next to
   `tabDragExceededThreshold`. TABBED uses X; STACKED uses Y.
   Index is the slot the pointer is over (or gap between tabs).
2. Hit-test “still on this group’s strip”: union of sibling tab
   actors (`node.tab`) or the decoration strip if that is cheaper
   and already exists. **Do not** treat tile body as strip.
3. Reorder mode: no tile drop-zone preview. Optional CSS gap on the
   strip. On release: build new child array, `replaceChildren`.
4. Leave strip: call existing `_startTabMoveGrab` once; do not keep
   a second commit path.
5. Press path in `tree.js` `_createWindowTab` already
   `clickFn` + `_armTabDragForWindow`. Keep that. Do not bypass
   `revealGroupChild`.

### Do not

- `createNode` / even 3rd H/V sibling / `mergeWindowsIntoGroup` for
  in-strip reorder
- Assign `childNodes` outside Node methods
- Change `dropChangesStructure` unless a unit proves misclassify
  (then **extend** that function)
- Touch `scripts/forge/layout_*.py` or `cli/`
- Invent a second DnD manager

### Files

- `lib/extension/drag-drop.js`
- `lib/extension/tree.js` (hit-test only if needed)
- `tests/unit/extension/tab-strip-reorder.test.js` (new)
- existing tab-drag / drag-drop tests

### Test

```bash
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/extension/drop-intent.test.js \
  tests/unit/window/WindowManager-drag-drop.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-tab-drag.test.js \
  tests/unit/extension/layout-open-leaf-pin.test.js
```

Live (after tip loaded):

```bash
./install && forge nested run -- true   # then stop; or logout
# 3 tabs in one TABBED group: drag middle along strip → new order
# drag a tab onto another tile CENTER → join; onto edge → slot-split
```

### Risks

- Preview fighting grab-tile zones if hit-test is sloppy → escalate
- Reorder during layout pin (R026) — keep pin on dragged child
- CON-rep tabs (`_ensureConTab`) — reorder the CON node, not the
  inner window, if the tab represents a nested CON

## Session note

**2026-08-14:** Locked. No code this session. First new-code slice
after tab-click live residuals.
