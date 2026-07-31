# C0 — Lossy layout-path inventory

**Plan:** [forge-first-class-containers.md](../forge-first-class-containers.md)  
**Wave:** C0 (inventory only; no non-destructive rewrite yet)  
**Invariants:** **I1** = `setLayout(con, L)` never reparents/flattens; **I2** = flatten/ungroup is explicit only.

Tag legend: **C1** non-destructive layout cycle · **C2** group/ungroup · **C5** residual strip / kits.

---

## Call sites (reparent / flatten / hard-reset percents on toggle or ensure)

| ID | Path | What it does | Wave | I1 | I2 |
| --- | --- | --- | --- | --- | --- |
| L1 | `lib/extension/command.js` → `LayoutTabbedToggle` | **C1 done:** `setLayout`; no percent wipe on exit; MONITOR force-split kept. | **C1 ✓** | **OK (I1)** | OK |
| L2 | `lib/extension/command.js` → `LayoutStackedToggle` | **C1 done:** same as L1 via `setLayout`. | **C1 ✓** | **OK (I1)** | OK |
| L3 | `lib/extension/command.js` → `LayoutToggle` | **C1 done:** H↔V via `setLayout`. | **C1 ✓** | **OK (I1)** | OK |
| L4 | `lib/extension/command.js` → `LayoutStackTabToggle` | STACKED↔TABBED via `setLayout` (C0). | **C1 ✓** | **OK (I1)** | OK |
| L5 | `lib/extension/session-api.js` → `_layoutOp` | **C1 done:** `setLayout` only; no flatten; no percent wipe. MONITOR wrap for tab/stack kept. | **C1 ✓** | **OK (I1)** | OK |
| L6 | ~~`_flattenLayoutParentToWindows`~~ → **`Tree.ungroupContainer`** + `resolveUngroupTarget` | **C2 done:** one-level CON dissolve (explicit). Deep peel deleted; not used from layout set. | **C2 ✓** | n/a | **OK (I2)** |
| L7 | `lib/extension/session-api.js` → `_layoutCycleOp` | **C1 done:** group + split via `setLayout`; no percent wipe on split flip. | **C1 ✓** | **OK (I1)** | OK |
| L8 | `lib/extension/tree.js` → `Node.resetLayoutSingleChild` | If stacked/tabbed and ≤1 child → force **HSPLIT**. **Mode only** — does not dissolve CON. | **C2 keep** (REG-auto-exit-tabbed) | soft I1 (mode without reparent) | **OK** (no reparent) |
| L9 | `lib/extension/tree.js` → remove/close path + `auto-exit-tabbed` | Single remaining tab → layout = split + **`resetSiblingPercent`** + clear `lastTabFocus`. **Mode only** — CON stays. | **C2 keep** | percent + mode | **OK** (no dissolve) |
| L10 | `lib/extension/tree.js` → `_finishMove` | After structural move: **`resetSiblingPercent`** on both parents + **`resetLayoutSingleChild`** on source. | **C2** / move epilogue | percent policy | via L8 |
| L11 | `lib/extension/tree.js` → `mergeWindowsIntoGroup` | Two siblings in split → **flip parent layout** + percent reset; else **new CON**, reparent both windows, percent reset; may **`resetLayoutSingleChild`** on partner's old parent. | **C2 ✓** explicit group | reparent path is structure op | **OK** |
| L12 | `lib/extension/drag-drop.js` | After DnD reparent, **`previousParent.resetLayoutSingleChild()`**. | **C2** | via L8 | via L8 |
| L13 | `lib/extension/session-api.js` move/rehome (~936, ~962) | **`resetLayoutSingleChild`** + percent on prior parent after reparent. | **C2** / session | via L8 | via L8 |
| L14 | `lib/extension/tree.js` → `cleanTree` | Orphan CON removal; **flatten nested single-child CON chains** (grandchildren → parent, inherit layout). Structural thrash hygiene. | **C5** evaluate | reparent | implicit flatten — only empty/degenerate nests if correct |
| L15 | `lib/extension/window.js` → `applyDefaultLayoutToContainer` | Stamps default tabbed/stacked on **new** CON after split. Mode only; no reparent. | **C1** optional `setLayout` | OK if new empty CON | OK |
| L16 | `lib/extension/window.js` → `_handleLayoutModeToggle` | Mode-flag disable: STACKED→TABBED or →split for all nodes of layout; restore on re-enable. Workspace-wide mode stamp. | **C5** | mode-only mostly | bulk mode change |
| L17 | `lib/extension/window.js` → tiny-pane tab fallback / open policy | May **`tree.split(..., true)`** then force TABBED (creates CON). | **C2** / open policy | invents structure | OK if policy |
| L18 | `lib/extension/command.js` → `WindowMergeGroup` / `WindowUngroup` | Group = merge; ungroup = `ungroupContainer` one level. | **C2 ✓** | as L11 / L6 | **OK** |
| L19 | ~~`toggleWorkspaceMonocle`~~ | **Deleted at C0** (REG-monocle). Was full-workspace gather + reparent into one TABBED CON + prune empties + percent reset. | **C0 done** | was max I1 violation | was max I2 violation |

---

## Grep anchors (for C1+)

```
resetLayoutSingleChild
ungroupContainer / resolveUngroupTarget
applyDefaultLayoutToContainer
LayoutTabbedToggle / LayoutStackedToggle / LayoutToggle / LayoutStackTabToggle
_layoutOp / _layoutCycleOp
mergeWindowsIntoGroup / WindowUngroup
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
