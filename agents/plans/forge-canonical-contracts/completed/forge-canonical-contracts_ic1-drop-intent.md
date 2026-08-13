# forge-canonical-contracts_ic1-drop-intent — CENTER group is a real op

**Status:** done
**Plan:** [forge-canonical-contracts](../forge-canonical-contracts.md)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

One drop-intent API that implements locked D0 + D024. Fix: drag lower
VSPLIT sibling onto upper CENTER (Grok onto Chrome) must create a TABBED
group, same as the reverse gesture and same as `mergeWindowsIntoGroup`.

## Acceptance

- [x] Pure `dropChangesStructure` (new `lib/extension/drop-intent.js` or
      sibling of `drop-zones.js`) — parent + order + **layout**
- [x] `_isNoOpDrop` is a thin wrapper; no positional CENTER special case
- [x] CENTER that groups two windows calls `tree.mergeWindowsIntoGroup`
      (do not flip `parent.layout` in `_executeDropOperation`)
- [x] `_findNodeWindowAtPointer` excludes the dragged meta; prefer target
      **tree slot** (`renderRect` / `initRect`) during grab
- [x] Unit: 2-child VSPLIT `[A, B]`, CENTER B→A **and** A→B both TABBED
- [x] Existing D3 edge no-op still holds (already bottom, drop BOTTOM)
- [x] Session `dnd-drop` uses the same intent helper
- [x] `npm test` for the touched drag-drop / drop-intent / tree merge files

## Context for the next agent

- Bug: `lib/extension/drag-drop.js` `_isNoOpDrop` ~711–748. CENTER is not
  `isBefore`, so `target.nextSibling === source` no-ops Grok-on-Chrome.
- Locked semantics: `agents/plans/forge-dnd-drop-zones.md` + D024.
- Canonical group API: `tree.mergeWindowsIntoGroup` (`tree.js` ~2053).
- Tests to extend: `tests/unit/window/WindowManager-drag-drop-comprehensive.test.js`
  (has BOTTOM no-op, not both-direction CENTER on a VSPLIT CON).
  `WindowManager-drag-drop.test.js` CENTER cases are mostly **mon-direct**.
- Do **not** rewrite zone geometry (`drop-zones.js` stays D0).
- Do **not** start IC2/IC3 in this slice.
- Comments: short why only (`agents/installed/comments.md`).

## Session note

**2026-08-13 IC1 implemented on master (no commit).**

**API:** `dropChangesStructure(source, target, operation, ctx)` in
`lib/extension/drop-intent.js` (pure, no GObject). True iff parent / order /
layout would change. CENTER never uses nextSibling. `_isNoOpDrop` =
`!dropChangesStructure`. Session `_dndDropOp` imports the same helper.
CENTER on H/V CON siblings executes via
`tree.mergeWindowsIntoGroup` (`shouldMergeCenterGroup`). Merge was
extended so a GRAB_TILE dragged leaf still counts as the 2nd sibling
(in-place flip, not a wrap). `_findNodeWindowAtPointer` skips the dragged
meta and, during grab, hits `renderRect` / `initRect` / `node.rect` then
frame (`dropTargetHitRect`).

**Files:** `lib/extension/drop-intent.js` (new), `drag-drop.js`,
`session-api.js`, `tree.js` (`mergeWindowsIntoGroup` GRAB_TILE). Tests:
`tests/unit/extension/drop-intent.test.js` (new), comprehensive CENTER
both directions + kept D3, `Tree-operations` GRAB_TILE in-place,
focus hit-test skips self / prefers slot.

**Proven:**
```
npm test -- tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/window/WindowManager-drag-drop.test.js \
  tests/unit/tree/Tree-operations.test.js \
  tests/unit/extension/drop-intent.test.js \
  tests/unit/window/WindowManager-focus.test.js
```
193 green. Also D4 / xom3 / bug-151 (12 green).

**Leftover:** live Grok-on-Chrome desk smoke (not run). Mon-direct CENTER
still `shouldCreateCon` (merge in-place is CON-only). Cross-parent CENTER
into H/V still insert+flip. 3+ same-parent H/V CENTER now merge-wraps
those two (canonical), not flip-all. IC2/IC3 not started.
