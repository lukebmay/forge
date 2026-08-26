# forge-child-list-contract — One child-list mutation path

**Status:** done
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-12

## Goal

R018 was a hand-rolled splice. Same class: callers assign `childNodes` /
`parentNode` instead of `appendChild`/`insertBefore`/`removeChild`. One
`Node.replaceChildren` contract; restore/order/hoist use it.

## Acceptance

- [x] `Node.replaceChildren(ordered)` is the child-list replace/reorder API
- [x] `applyMonitorSnapshot` (pure + mixed) uses it
- [x] `restoreLayoutGroups` uses it (no splice + parentNode assign)
- [x] session-api order / hoist / unwrap use Node APIs
- [x] Existing snapshot / bqa / order tests green (136 in this slice)

## Context for the next agent (complete + succinct)

- **Canonical:** `Node.appendChild` / `insertBefore` / `removeChild` /
  `replaceChildren`. Do not assign `childNodes` or `parentNode` outside Node.
- **Left alone (different ops, high risk):** `Tree.split` (wrap-in-place),
  `swapPairs` (slot exchange + rects). Still array writes; not this slice.
- **Also not merged:** `resetSiblingPercent` vs `renormalizeChildPercents`
  (wipe vs scale); `resolveTargetMonitor` vs `resolveStrictMonitor` (D dual).
- **Proven:** R018 insertBefore-self; `restoreLayoutGroups` splice after
  rebuild; `_reorderParentChildren` `childNodes = ordered`; hoist/unwrap
  rewrite arrays.

## Session note

**Shipped:** `Node.replaceChildren` — child-list replace/reorder. Callers:
`applyMonitorSnapshot`, `restoreLayoutGroups`, `_reorderParentChildren`,
`_hoistNestedMonPanes`. Unwrap uses `insertBefore` + `removeChild`.
`lib/extension` has no more `childNodes =` assigns.

**Left in Tree:** `split` / `swapPairs` still write slots (wrap-in-place and
pair exchange). Different ops; do not casually convert.

Tests: Node + tree-snapshot + session-layout + bqa + H1 + layout-cycle + Tree
green. No commit.
