# forge-tab-click-drag_pr3-wire-wrap — Wire planTabbedWrap into processTabbed

**Status:** done
**Plan:** [forge-tab-click-drag](../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Agent:** Grok **4.5** · reasoning **med**

## Goal

`processTabbed` uses `planTabbedWrap` for row planning and bar
height. Schema defaults stay **0** (product wrap still off on
fresh install). Forced `min-tab-label-chars` can paint multi-row
for nest smoke.

This is **PR3 only**. No wrap default flip (PR5). No 2D insert
(PR5). Do not reshape PR4 float+gap.

## Acceptance

- [x] `processTabbed` calls `planTabbedWrap` with
      `rowInnerWidth = this.processGap(con).width` (Tree
      wrapper + `calculateGaps` — not one-arg pure)
- [x] `measureMinTabWidth` adapter (Pango/St out of
      `tree-layout.js`); `minChars===0` → `minTabWidth=0`
- [x] `totalBar = stackedHeight * plan.rowCount` (not
      `tabbedBarHeight(..., max-tabs-per-line)`)
- [x] `rowCount > 1` → row hosts / vertical outer (not only
      `maxPerLine >= 1`)
- [x] Settings: read `min-tab-label-chars` + `max-tab-rows` +
      existing `max-tabs-per-line`
- [x] `window.js` settings switch force-renders on the new keys
- [x] Schema default still 0 → daily driver single-row
- [x] Units for processTabbed / forced wrap where feasible
- [x] Optional nest mon=1 with forced chars paints multi-row;
      nest stopped after — **skipped** (L0 sufficient; residual)

## Context for the next agent (complete + succinct)

### Done already

- **PR2:** `planTabbedWrap` + `minTabWidthFromChars` + schema
  keys default 0 ·
  [completed](./completed/forge-tab-click-drag_pr2-wrap-pures.md)
- **PR4:** Chrome float+gap same-strip ·
  [completed](./completed/forge-tab-click-drag_pr4-chrome-live-reorder.md)

### Locked

1. `rowInnerWidth = this.processGap(con).width` (Tree method).
2. Glyph/chrome measure use same physical space as gap (`Utils.dpi()`).
3. Do not flip `min-tab-label-chars` default to 20.
4. Keep `tabbedChildRect` total bar inset.

### Files

| File | Change |
| --- | --- |
| `lib/extension/tree.js` | `processTabbed`, `measureMinTabWidth`, settings params, processGap null-safe |
| `lib/extension/window.js` | force-render min-tab-label-chars / max-tab-rows; cache invalidate on css + bar height |
| `tests/unit/tree/Tree-layout.test.js` | default single-row, forced width multi-row, maxRows, rowCount gate |

### L0

```bash
npm test -- tests/unit/tree/Tree-layout.test.js \
  tests/unit/extension/tab-strip-reorder.test.js
```

**Result:** 105/105 green (Tree-layout 76 + tab-strip-reorder 29).

## Session note

**2026-08-17 PR3 done.**

**Wire:** `processTabbed` reads `min-tab-label-chars`, `max-tab-rows`,
`max-tabs-per-line` (params from `processNode` + live settings
fallback). `rowInnerWidth = this.processGap(node).width` (Tree
wrapper; `calculateGaps` null-safe → 0). Plans via
`TreeLayout.planTabbedWrap`; caches plan on `params._tabbedWrapPlan`
for sibling children. `totalBar = stackedHeight * plan.rowCount`.
Hosts/vertical outer only when `plan.rowCount > 1` (not
`maxPerLine >= 1`).

**Measure:** `Tree.measureMinTabWidth({ minChars, dpi, fontDesc })`.
`minChars===0` → 0 (no chrome floor). Else
`minTabWidthFromChars(chars, avgGlyph, chromePx)` with
`_tabChromePx` = `(24+30+12)*dpi` (icon+close+pad physical) and
`_avgTabGlyphPx` via `St.Label` preferred width of `"0"×minChars`
under `.window-tabbed-tab`; fallback `0.55*11*dpi` when unrealized.
Cache key `fontDesc|dpi|minChars`; `invalidateMinTabWidthCache` on
`css-updated` and `stacked-tab-bar-height`. Units may pass
`params.minTabWidth` / `rowInnerWidth` to skip measure.

**Schema:** defaults still 0; daily driver single-row.

**Nest:** skipped (L0 proves plan + hosts). Manual smoke:
`gsettings set … min-tab-label-chars 40` on a narrow TABBED
tile.

**Residual for PR5:** flip `min-tab-label-chars` default to 20;
2D insert index; wrap-on with live float+gap across rows.
No commit/push this slice.
