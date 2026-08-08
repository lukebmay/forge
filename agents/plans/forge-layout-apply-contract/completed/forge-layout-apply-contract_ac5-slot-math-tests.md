# Task: forge-layout-apply-contract_ac5-slot-math-tests

**Status:** done  
**Plan:** [forge-layout-apply-contract.md](../../forge-layout-apply-contract.md)  
**Branch:** `plan/forge-layout-apply-contract`  
**Created:** 2026-08-07  
**Completed:** 2026-08-07  
**Depends:** AC1  
**Host:** black — unit tests only (Wayland; no live HUP)

## Goal

Harden **pure slot / geometry** unit tests so wrong math is caught as
correctness bugs, not thrash (plan §5.0 O8, §12 AC5).

Tree owns intended rects from workarea + percents + gaps + tab chrome insets.
These pure paths must be high-test, high-review.

## Scope (in)

1. Inventory existing tests covering:
   - mon workareas → root slots  
   - H/V split percent distribution  
   - nested splits  
   - gaps / outer margins  
   - tab chrome / stack insets affecting leaf rects  
2. **Add gaps** where coverage is thin (prefer pure functions / Tree.processNode fixtures without full Shell).  
3. At least one test each for: dual-mon different workareas; nested H then V; percent sum edge cases if APIs allow; buffer/scale align if already used.  
4. Do **not** change production geometry policy unless a clear bug is proven by a failing test you add (then fix minimally).  

## Out of scope

- Live smoke (AC6)  
- Residual nudge  
- Placeholder visual polish  

## Acceptance

1. New or extended pure/unit tests for slot math; suite green.  
2. Document in test file header what contract they guard (apply-contract O8).  
3. No live HUP.  
4. Session notes.

## FIRM

Branch plan/forge-layout-apply-contract. No push/SSH. No commit by A. High reasoning.

## Session note

**2026-08-07 (A — AC5 implement):** Extended
`tests/unit/tree/Tree-layout.test.js` for apply-contract O8.

- Header notes O8 / §5.0 pure geometry contract.
- Pure helpers: `applyMargins`, `processGap`, `splitChildRect`, tab/stack insets.
- `computeSizes` percent edges: remainder fold, zero/missing → equal, sum >1 / <1.
- `processNode` fixtures: dual-mon different workareas; nested H→V percents;
  outer margins; gaps (mon + leaf renderRect); margins+gaps; TABBED/STACKED
  chrome insets; nested TABBED under HSPLIT + gap; buffer-scale align rule.
- **65** tests green (`npm test -- tests/unit/tree/Tree-layout.test.js`).
- **No production changes.** No commit (A).
