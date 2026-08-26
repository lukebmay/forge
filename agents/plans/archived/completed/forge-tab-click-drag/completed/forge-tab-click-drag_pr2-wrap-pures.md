# forge-tab-click-drag_pr2-wrap-pures — TABBED wrap planner + settings

**Status:** done
**Plan:** [forge-tab-click-drag](../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Agent:** Grok **4.5** · reasoning **med**

## Goal

Land pure readable-fill wrap planner and GSettings keys. Schema
defaults stay **off** (`min-tab-label-chars=0`, `max-tab-rows=0`).
Do **not** wire `processTabbed` (that is PR3). Do **not** flip
wrap-on to 20 (that is PR5).

## Acceptance

- [x] `planTabbedWrap` + `minTabWidthFromChars` in
      `lib/extension/tree-layout.js` per plan §4 algorithm
- [x] Units: width wrap, count cap AND, row cap shrink,
      `minChars=0, maxPerLine=0, width=200 → rowCount=1`,
      empty, `rowInnerWidth < minTabWidth` → one per row
- [x] Schema keys `min-tab-label-chars` (default **0**) and
      `max-tab-rows` (default **0**) in gschema +
      `config/settings.schema.json` + `settings-keys.js` +
      prefs appearance copy + testFixtures
- [x] Prefs: 0 = width wrap off / unbounded rows
- [x] `processTabbed` **unchanged** (still count-only T9)
- [x] L0 Tree-layout units green; no nest required

## Context for the next agent (complete + succinct)

### Read first

1. Plan §4 Multi-row wrap + PR2 section.
2. Existing `planTabRows` / `tabbedBarHeight` in
   `tree-layout.js` — keep chunker; add planner on top.
3. Do not re-litigate D039–D044. Do not flip default to 20.

### Locked planner rules

1. `minChars === 0` ⇒ `minTabWidth = 0` (no chrome-only floor).
2. `fit = max(1, floor(rowInnerWidth / minTabWidth))` when
   minTabWidth > 0; else `fit = n`.
3. `maxPerLine >= 1` ⇒ `perRow = min(fit, maxPerLine)`.
4. `maxRows >= 1` and rowCount > maxRows ⇒ re-chunk with
   `ceil(n/maxRows)`, `capped: true`.
5. Keep `planTabRows` as the chunker.

### Files

| File | Change |
| --- | --- |
| `lib/extension/tree-layout.js` | `planTabbedWrap`, `minTabWidthFromChars` |
| `tests/unit/tree/Tree-layout.test.js` | pure cases |
| `schemas/…gschema.xml` | two uint keys default 0 |
| `config/settings.schema.json` | same |
| `lib/shared/settings-keys.js` | appearance list |
| `lib/prefs/appearance.js` | prefs rows + subtitles |
| `tests/mocks/helpers/testFixtures.js` | defaults |

### L0

```bash
npm test -- tests/unit/tree/Tree-layout.test.js
```

## Session note

**2026-08-17 (PR2 implementer):** Landed pure wrap planner +
settings keys only. `processTabbed` / `drag-drop.js` /
decoration / nest **not** touched.

**Landed**
- `minTabWidthFromChars(minChars, avgGlyphPx, chromePx)` —
  returns `0` when `minChars === 0`; else
  `chars * glyph + chrome`.
- `planTabbedWrap({ count, rowInnerWidth, minTabWidth,
  maxPerLine, maxRows })` →
  `{ rows, rowCount, perRow, capped }`; uses `planTabRows`
  as chunker; row-cap re-chunks with `ceil(n/maxRows)`.
- GSettings `min-tab-label-chars` (0–80, default **0**) and
  `max-tab-rows` (0–10, default **0**) in gschema + JSON
  schema + `settings-keys` appearance + prefs SpinButtons +
  testFixtures.

**L0:** `npm test -- tests/unit/tree/Tree-layout.test.js` →
**72/72 pass** (suite `planTabbedWrap / minTabWidthFromChars`
covers width wrap, count AND, row cap, minChars=0 single row,
empty, narrow width).

**Risks for PR3**
- Must read keys via settings and pass
  `rowInnerWidth = this.processGap(con).width` (Tree wrapper,
  not pure one-arg).
- Bar height must use `plan.rowCount`, not
  `tabbedBarHeight(..., max-tabs-per-line)`.
- Wire only; leave schema defaults at 0 until PR5.
- Schema compile / install may need `glib-compile-schemas`
  for live Shell prefs.
