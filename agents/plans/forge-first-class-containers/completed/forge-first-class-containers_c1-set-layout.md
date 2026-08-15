# forge-first-class-containers_c1-set-layout — Non-destructive setLayout (I1)

**Status:** done  
**Plan:** [forge-first-class-containers](../../forge-first-class-containers.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** grok implementer (C1)

## Goal

Changing a CON between HSPLIT / VSPLIT / TABBED / STACKED **does not
reparent or flatten children** (invariant I1). `layout-cycle` and
keybind layout toggles call one named API.

## Acceptance

- [x] `tree.setLayout(con, layout)` / `Node.setLayout` only writes
      `layout` (+ optional `lastTabFocus`). Child identity/order
      unchanged. `resetPercents` is Tree-level opt-in (H↔V).
- [x] Catalog row in `docs/dev/contracts.md`: job “change CON layout
      mode” → `tree.setLayout` / `Node.setLayout`
- [x] `session-api` `layout-cycle` / `_layoutCycleOp` uses it
- [x] Call sites converted **or** remaining listed with reason
- [x] Unit: children ids stable across H→tab→H and tab→stack
- [x] No silent `replaceChildren` that drops nested CONs for mode change
- [x] `commitLayout` once after the mode change (existing pipeline)

## Session note

**2026-08-15 C1 shipped on master (uncommitted until operator commits).**

### API

| Surface | Path | Behavior |
| --- | --- | --- |
| `Node.setLayout(layout, opts?)` | `lib/extension/tree.js` | CON/MONITOR only; layout field + optional `lastTabFocus`; **no** reparent/flatten |
| `Tree.setLayout(con, layout, opts?)` | same | Delegates to Node; optional `resetPercents` → `resetSiblingPercent` |

### Converted (I1 path)

| Site | File |
| --- | --- |
| `LayoutToggle` / `LayoutStackedToggle` / `LayoutTabbedToggle` / `LayoutStackTabToggle` | `command.js` |
| `_layoutCycleOp` | `session-api.js` |
| `_layoutOp` layout field write | `session-api.js` (still flattens first — see remaining) |
| `applyDefaultLayoutToContainer` | `window.js` |
| `_handleLayoutModeToggle` | `window.js` |
| `Node.resetLayoutSingleChild` | `tree.js` |
| auto-exit-tabbed + empty MONITOR reset | `tree.js` `removeNode` |
| `_reorientOnClose` | `tree.js` |
| `mergeWindowsIntoGroup` layout stamp | `tree.js` (structure still reparents; mode write via setLayout) |

### Remaining (not setLayout / intentional)

| Site | Why keep |
| --- | --- |
| `_layoutOp` + `_flattenLayoutParentToWindows` | **REG-ensure-flatten** — profile/CLI ensure still peels nested CONs before setLayout. Documented as reshape, not I1. User toggles + layout-cycle do **not** flatten. |
| `tree.split` / slot-split / insert wrap | Structure ops (not mode-only) |
| DnD createCon / simple insert / center merge | Structure + drop policy |
| `cleanTree` single-child collapse | Inherit layout while reparenting |
| tree-snapshot / mon recovery / `_newLayoutCon` | Scaffold restore |
| leftoverSlot / tiny-pane tab fallback | Open/insert structure |
| peel-to-pair layout stamp | Move epilogue structure |

### Contracts

`docs/dev/contracts.md` row: **Change CON layout mode** → `tree.setLayout` / `Node.setLayout`.

### Tests

New: `tests/unit/tree/set-layout-i1.test.js` (H→tab→H, tab→stack, nested CON preserved, layout-cycle no flatten).

```bash
npm test -- tests/unit/tree/set-layout-i1.test.js \
  tests/unit/tree/Tree-operations.test.js \
  tests/unit/tree/Tree-layout.test.js \
  tests/unit/command/CommandHandler.test.js \
  tests/unit/extension/session-api-layout-cycle.test.js
# 223 passed
# also: bug-tz-tab-apply-flatten + WM layout/commands — 60 passed
```

### Do not (confirmed)

- No C2 group/ungroup
- No insert A / D032 change
- No CLI layout port
- No monocle re-add
- Uncommitted (operator did not ask to commit)
