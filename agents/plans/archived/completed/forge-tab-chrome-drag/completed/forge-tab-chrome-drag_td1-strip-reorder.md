# forge-tab-chrome-drag_td1-strip-reorder — Reorder tabs on the strip

**Status:** done  
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

- [x] Pointer stays on the same group’s strip after the 8px threshold
      → child order changes via `parent.replaceChildren` (D023)
- [x] Group layout stays TABBED/STACKED; percents on nodes unchanged
- [x] Open leaf / live pin stays the dragged child (no surprise reveal)
- [x] Pointer **leaves** the strip → existing `_startTabMoveGrab` +
      drop-zones (CENTER join, edge slot-split D032, empty-mon R022)
- [x] Click without drag still `revealGroupChild` (R025/R026)
- [x] Close-button path unchanged (no arm)
- [x] Pure insert-index helper unit-tested
- [x] Suites below green
- [x] Live after `./install` + nest or logout: 3-tab group reorder,
      then peel one onto an edge

## Context for the next agent (complete + succinct)

### Live result (2026-08-14)

**PASS** on tip `v49-90-beta.2-317-gb280f94` via
`forge nested run` + Shell.Eval synthetic tab-drag (host has no
xdotool/ydotool; host Shell.Eval disabled). Nest stopped after.

| Step | Result |
| --- | --- |
| Setup | 3 zenity windows → unfloat → dnd-drop CENTER → TABBED |
| Before | `[2105001302, 2105001304, 2105001305]` |
| Reorder | middle tab along strip past 8px → `st1/st2=reorder`, `insertIndex=3` |
| After reorder | `[2105001302, 2105001305, 2105001304]`; layout TABBED |
| Open leaf | `lastTabFocusId` = dragged `2105001304` |
| Peel | leave strip → `stOff=active` `mode=GRAB_TILE` synthetic; edge drop |
| After peel | peeled WINDOW under mon HSPLIT; remaining 2 stay TABBED |

Host desk already had mon1 3-tab Chrome group; not used (no pointer
automation on host Wayland). Reorder is **not** dnd-drop — exercised
`armTabDrag` / `noteTabDragMotion` / `finishTabDragRelease` on live
tab actors. Peel forced synthetic grab (`begin_grab_op` → false) so
drop could complete headless; strip→grab transition still real.

### Shipped (code session)

- Pure: `tabStripInsertIndex`, `applyTabStripReorder`,
  `pointerOnTabStrip`, `tabActorScreenRect` in
  `lib/extension/drag-drop.js` (next to `tabDragExceededThreshold`).
- `noteTabDragMotion`: past threshold **on strip** → reorder mode
  (`"reorder"`); leave strip → `_startTabMoveGrab` once; no strip →
  grab as before.
- Release in reorder: `group.replaceChildren(next)` +
  `commitLayout("tab-strip-reorder")`; **no** `resetSiblingPercent`;
  `settleTabFocus` only (no `revealGroupChild`).
- CON-rep: walks up to TABBED/STACKED parent; unit is the CON child.
- Preview CSS: `.window-tabbed-tab-reorder-insert` on insert-before tab.
- Contract row: strip reorder → `tabStripInsertIndex` + `replaceChildren`.
- Tests: `tests/unit/extension/tab-strip-reorder.test.js` (19).

### Do not

- Second DnD manager / change `dropChangesStructure` without proof
- Touch `scripts/forge/layout_*.py`, `cli/`, R028 late-identity wrap
- Start CN*, AL0, FCC, R027, Wave Z / commit-push

### Enable / test

```bash
npm test -- tests/unit/extension/tab-strip-reorder.test.js \
  tests/unit/extension/drop-intent.test.js \
  tests/unit/window/WindowManager-drag-drop.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-tab-drag.test.js \
  tests/unit/extension/layout-open-leaf-pin.test.js
# 131 passed
# Live (this residual): forge nested run -- python3 /tmp/td1-strip-reorder-live.py
```

### Risks

- Live hit-test uses `tab` actor x/y or transformed position; if Shell
  geometry is zero until map, reorder falls through to grab
- Multi-row tabs (T9): still axis X only for TABBED
- Host Wayland: no xdotool/ydotool; Shell.Eval off — nest or human
  pointer for any further host smoke

## Session note

**2026-08-14 (live residual):** TD1 live **PASS** nest tip
`gb280f94`. Reorder middle→end; peel first tab off strip to edge →
HSPLIT + 2-tab remainder. Code changes: none. Nest stopped. No
escalations.
