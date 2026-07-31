# C0 — Lossy layout-path inventory

**Plan:** [forge-first-class-containers.md](../forge-first-class-containers.md)  
**Wave:** C0 (inventory only; no non-destructive rewrite yet)  
**Invariants:** **I1** = `setLayout(con, L)` never reparents/flattens; **I2** = flatten/ungroup is explicit only.

Tag legend: **C1** non-destructive layout cycle · **C2** group/ungroup · **C5** residual strip / kits.

---

## Call sites (reparent / flatten / hard-reset percents on toggle or ensure)

| ID | Path | What it does | Wave | I1 | I2 |
| --- | --- | --- | --- | --- | --- |
| L1 | `lib/extension/command.js` → `LayoutTabbedToggle` | Tab↔split: on exit to split, **`resetSiblingPercent(parent)`**; may **`tree.split(..., true)`** if parent is MONITOR (creates CON). Mode assign is direct (`parent.layout = …`). Nested CON children kept but percents wiped on exit. | **C1** | **violates** (percent wipe; split invent on monitor) | soft — no explicit flatten of nest |
| L2 | `lib/extension/command.js` → `LayoutStackedToggle` | Stack↔split: same pattern as L1 (`resetSiblingPercent` on exit; force-split on MONITOR). TABBED→STACKED clears `lastTabFocus`. | **C1** | **violates** (percent wipe; split invent) | soft |
| L3 | `lib/extension/command.js` → `LayoutToggle` | H↔V only: mode flip, **no** reparent, **no** percent reset. Closest to I1 today. | **C1** | mostly OK; should go through `setLayout` | OK |
| L4 | `lib/extension/command.js` → `LayoutStackTabToggle` | STACKED↔TABBED only; **wired via `setLayout` (C0)**. No reparent. Activate last child on →STACKED (presentation). | **C1** polish | **OK (I1)** | OK |
| L5 | `lib/extension/session-api.js` → `_layoutOp` | Absolute layout set. **H/V → TABBED\|STACKED calls `_flattenLayoutParentToWindows(parent)`** (peels nested CONs). H/V also **`resetSiblingPercent`**. MONITOR parent → `tree.split` first for tab/stack. | **C1** | **violates** (flatten + percent) | **violates** (silent flatten) |
| L6 | `lib/extension/session-api.js` → `_flattenLayoutParentToWindows` | DFS peel nested CON children until window leaves only. Used by L5. | **C1** / **C2** | n/a (is the flatten) | **violates** if used from toggle; OK if only explicit ungroup |
| L7 | `lib/extension/session-api.js` → `_layoutCycleOp` | `layout-cycle` axis `group`/`split`. Group: mode only. Split: mode + **`resetSiblingPercent`**. | **C1** | split axis **violates** percent; group OK | OK |
| L8 | `lib/extension/tree.js` → `Node.resetLayoutSingleChild` | If stacked/tabbed and ≤1 child → force **HSPLIT**. Implicit mode change. | **C1–C2** (REG-auto-exit-tabbed adjacent) | soft I1 (mode without reparent) | **violates I2** if user group |
| L9 | `lib/extension/tree.js` → remove/close path + `auto-exit-tabbed` | Single remaining tab → layout = split (`determineSplitLayout` / reorient) + **`resetSiblingPercent`** + clear `lastTabFocus`. | **C1–C2** | percent + mode | **violates I2** when dissolving user tab bag |
| L10 | `lib/extension/tree.js` → `_finishMove` | After structural move: **`resetSiblingPercent`** on both parents + **`resetLayoutSingleChild`** on source. | **C2** / move epilogue | percent policy | via L8 |
| L11 | `lib/extension/tree.js` → `mergeWindowsIntoGroup` | Two siblings in split → **flip parent layout** + percent reset; else **new CON**, reparent both windows, percent reset; may **`resetLayoutSingleChild`** on partner's old parent. | **C2** | reparent path is structure op (OK if explicit group) | explicit group = OK for I2 |
| L12 | `lib/extension/drag-drop.js` | After DnD reparent, **`previousParent.resetLayoutSingleChild()`**. | **C2** | via L8 | via L8 |
| L13 | `lib/extension/session-api.js` move/rehome (~936, ~962) | **`resetLayoutSingleChild`** + percent on prior parent after reparent. | **C2** / session | via L8 | via L8 |
| L14 | `lib/extension/tree.js` → `cleanTree` | Orphan CON removal; **flatten nested single-child CON chains** (grandchildren → parent, inherit layout). Structural thrash hygiene. | **C5** evaluate | reparent | implicit flatten — only empty/degenerate nests if correct |
| L15 | `lib/extension/window.js` → `applyDefaultLayoutToContainer` | Stamps default tabbed/stacked on **new** CON after split. Mode only; no reparent. | **C1** optional `setLayout` | OK if new empty CON | OK |
| L16 | `lib/extension/window.js` → `_handleLayoutModeToggle` | Mode-flag disable: STACKED→TABBED or →split for all nodes of layout; restore on re-enable. Workspace-wide mode stamp. | **C5** | mode-only mostly | bulk mode change |
| L17 | `lib/extension/window.js` → tiny-pane tab fallback / open policy | May **`tree.split(..., true)`** then force TABBED (creates CON). | **C2** / open policy | invents structure | OK if policy |
| L18 | `lib/extension/command.js` → `WindowMergeGroup` | Calls `mergeWindowsIntoGroup` (L11). | **C2** | as L11 | explicit |
| L19 | ~~`toggleWorkspaceMonocle`~~ | **Deleted at C0** (REG-monocle). Was full-workspace gather + reparent into one TABBED CON + prune empties + percent reset. | **C0 done** | was max I1 violation | was max I2 violation |

---

## Grep anchors (for C1+)

```
resetLayoutSingleChild
_flattenLayoutParentToWindows
applyDefaultLayoutToContainer
LayoutTabbedToggle / LayoutStackedToggle / LayoutToggle / LayoutStackTabToggle
_layoutOp / _layoutCycleOp
mergeWindowsIntoGroup
auto-exit-tabbed
cleanTree
resetSiblingPercent  (on layout exit paths — not all resize)
```

---

## Priority for C1

1. **L5 + L6** — session absolute layout flatten (largest silent nest destroyer after monocle).  
2. **L1 + L2** — keybind tab/stack ↔ split percent wipe + monitor force-split.  
3. **L7** split-axis percent reset — decide policy (equalize only on explicit “equalize”).  
4. **L9 / L8** — `auto-exit-tabbed` / `resetLayoutSingleChild` (REG-auto-exit-tabbed).  
5. Keep **L4** as reference I1 path (`setLayout` in `layout-unit.js`).

---

## Out of inventory scope (not layout toggle/ensure)

- Resize expand/shrink percent walks (Wave **R**).  
- Session layout profile apply / thrash repair (may intentionally reshape; flag only as REG-ensure-flatten when toggles misuse them).  
- Zoom (Wave **Z**).
