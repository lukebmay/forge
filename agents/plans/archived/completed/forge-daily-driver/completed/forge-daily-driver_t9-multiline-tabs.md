# T9 — Multi-line tabs (v1 wrap)

**Plan:** [forge-daily-driver.md](../plans/forge-daily-driver.md)  
**Status:** Ready  
**Priority:** Later polish (after T0–T7 + thrash-zero)  
**Depends:** T1 tab chrome Done  
**Task force:** A implement → B verify  

## Goal

North Star first slice: **wrap tab chrome into multiple rows** when a max-per-line
cap is set. `max_tabs_per_line=1` behaves like stack chrome height (one label
per row) without reintroducing STACKED as the default product path.

Default **off** (unlimited single row) so daily driver behavior is unchanged
until the user opts in.

## Product

| Setting | Behavior |
| --- | --- |
| `max-tabs-per-line` = **0** (default) | Current: one horizontal tab row |
| `max-tabs-per-line` = **N ≥ 1** | Wrap after N tabs; bar height = rows × row height |
| Content | Window content inset uses **total** multi-row bar height |
| Active tab | Still one raised leaf; row hosts are chrome only |

**Out of this slice:** deprecate STACKED enum; convert stack→max1 migration;
prefs fancy UI beyond schema key (minimal prefs OK if pattern exists); flex
engine rewrite.

## Implementation sketch

1. **Pure** (`tree-layout.js` or small sibling):  
   `planTabRows(count, maxPerLine) → { rows, rowCount }`  
   `tabbedBarHeight(rowHeight, count, maxPerLine) → totalBarHeight`  
   (0 max → 1 row; max=1 → count rows)
2. **GSettings** `max-tabs-per-line` (uint, default 0) in gschema + settings.schema.json
3. **Layout:** `tabbedChildRect` / process path use total bar height when multi-row
4. **Decoration:** CON decoration host supports multi-row (outer vertical + row
   BoxLayouts, or equivalent); attach tabs into row hosts; self-heal still N labels
5. **Tests:** pure planner unit tests; existing tab chrome regressions still green

## Acceptance

- [x] Default 0: no visual/layout change vs pre-T9
- [x] max=N: N+1 tabs → 2 rows; content Y/height accounts for 2× bar row
- [x] max=1 with K tabs → K bar rows (stack-like height); still TABBED layout
- [x] T1 invariant: N labels for N tiled children when showtab on
- [x] `npm test` / unit tab + tree-layout tests green
- [x] task + plan session notes; archive on Done

## Non-goals

- Force STACKED off migration scripts
- i3 full parity docs rewrite
- Always-on multi-line for all users

## Session note

**Status:** Done A/B AGREE (2026-07-28)

- Setting `max-tabs-per-line` default **0** (opt-in wrap)
- Pure: `planTabRows`, `tabbedBarHeight` in `tree-layout.js`
- Multi-row chrome: outer VERTICAL + row hosts when max≥1
- Prefs spin + settings-keys; re-render on change
- Tests: Tree-layout 44; npm test 1894
- Live smoke optional on black
