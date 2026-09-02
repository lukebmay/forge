# P1b — Extract RuleSet settle → `lib/rulesets/`

**Status:** done
**Updated:** 2026-08-27
**Implementer:** Grok 4.6 (module-boundary reshape)
**Brake:** `cd prototypes/container-motion && npm test` → **ALL PASSED (145 cases)**
**Lock:** [`ruleset.md`](./ruleset.md) · D080

## Goal

Settle is a **named gi-free module** OpSets bind. Proto and (later)
Forge call the same `settle()`. `lib/tom/composed.js` must not own
prune / unary / cleanup after this slice.

## Landed

1. **`lib/rulesets/package.json`** `{ "type": "module" }`
2. **`lib/rulesets/core.js`** — `pruneEmptyCons`, `collapseUnary`,
   `cleanupStructure`; `settle` is an alias of `cleanupStructure`.
   Share repair stays inside unary/prune (no third pass).
3. **`lib/rulesets/mark2.js`** — `coerceDifferentType`,
   `preferredSplitVsParent` (layout law; OpSet hydrates decisions then
   calls it), `coerceSameTypeUnder`, `wrapMonitorMax1`, `settle` /
   `settleForest`. Aliases: `mark2CleanupUnder` / `mark2CleanupForest`.
4. **`lib/tom/composed.js`** — settle functions deleted. Remaining:
   `equalizeChildren`, `swapSiblings`, `rotateChild`, `breakout`,
   `wrapNodes`, `promoteChildren`, `setLayoutTiling`.
5. **`lib/tom/index.js`** — no longer exports prune/unary/cleanup.
6. **`lib/tom/api.js`** — TomApi prune/collapse/cleanup/flatten
   delegate to `../rulesets/core.js` (composed cases still green).
7. **`src/opsets/mark2.mjs`** — imports RuleSet; no private
   prune/unary/coerce loop. `MARK2_OPSET.settle` → `settleForest`.
   Re-exports coerce + cleanup names for `opsets/index.mjs`.
8. **MONITOR max-1** — **wired** in the mark2 settle loop (prune →
   unary → coerce → wrap, repeat ≤32). Empty MONITOR stays empty.
9. **Test** `settle-monitor-max1-wrap` (opset): Given `Mon1(A,B)` →
   OpSet settle → `Mon1(H(A,B))`. Atomics/shorthand `Mon1(A,B)`
   unchanged.
10. **`mark2.md`** — one Settle sentence for n-child MONITOR wrap.
11. **`agents/design.md`** § TOM — RuleSet lives at `lib/rulesets/`.

**Cycle:** `api.js` → `rulesets/core.js` → `tom/{atomics,composed,kernel,sizing}`.
RuleSet does not import `api.js` or `src/opsets/mark2.mjs`.

**Brake:** shorthand 6, atomics 45, composed 14, opset **60** (+1),
workflow 20 → **ALL PASSED (145 cases)**.

Forge `tree.js` / `window.js` / `tree-snapshot.js` untouched.

## Remaining (not this slice)

- **P1c** — `lib/keybinds/` Super-bearing table
- P2 strip `decisions` / `mergeTags`
- Forge adopt of RuleSet (`tree.cleanTree`) — later
