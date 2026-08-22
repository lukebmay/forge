# forge-layout-ws-orphan-min-float-dnd — Layout thrash, false float, dead dropzones

**Status:** done
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-21

## Goal

Fix three coupled host bugs:
1. `forge layout vinyl` on ws2 fails `phase=size` ("size targets not under common parent") and mutates/closes windows on other workspaces; subsequent `layout dev` open-miss.
2. Windows float spuriously (journal `overflow-float`) from false min-learn / poisoned `window-mins.json`.
3. Titlebar drop zones die after launches / float — sticky or consequence of (2).

## Acceptance

- [x] ApplyLayout snapshot / `collectWindows` must not claim/close other-workspace windows when applying on one ws
- [x] `_sizeOp` soft-skips (like order) when mon-directs lack a common parent — no hard apply abort after closes
- [x] CLI must not say "nothing applied" when bind/order already mutated
- [x] `noteWindowMinFromClamp` requires frame below prior; no live size-changed learn; absurd caps reject half-pane poison
- [x] `rehomeIfSlotTooSmall`: if Meta frame already fits slot → ratchet mins down, do not float
- [x] Unmanaged mid-grab clears `_draggedNodeWindow` / GRAB_TILE / stage track
- [x] L0 tests for the above; nest smoke when code path needs Shell

## Context for the next agent

- Product: same-ws orphans only (`_orphanWindowProjections`);
  `filterForestWorkspace` also filters extras fail-closed; `_sizeOp` soft-skip;
  min-learn needs finite prior that shrank; no live size-changed learn;
  absurd caps **800×600**; frame-fits-slot → ratchet not float;
  unmanaged mid-grab `_clearGrabOnUnmanaged`.
- `assertApplyForestWorkspace` still monitors-only (do not assert-away orphan bugs).
- `assertionFailed()` apply/DnD/launch skip unchanged.
- Stash `ws-orphan WIP park` (`36e02b267c1c2605ebd9e555d4d3d285aad9a751`) **dropped** after hunks landed.
- Nest not required (unit-covered). Remaining OH downstream: monitor identity +
  same-mon dock launch. Soft D049 tiny-env.

## Session note

Reapplied `ws-orphan WIP park` onto OH1–OH3 tree (no stash pop). Kept plog +
`assertionFailed` + monitor-only apply-ws assert. Traces: orphan skip, size
soft-skip, min-learn reject, overflow ratchet vs float.

Paths: `session-api.js` `_orphanWindowProjections` / `_sizeOp`;
`layout-plan.js` + Python twin extras filter; `tree-layout.js` 800×600 + prior
shrink; `window.js` epoch/open-commit skip, ratchet, `_clearGrabOnUnmanaged`,
no live size-changed learn; `scripts/forge/forge` multi-fail copy.

L0: layout-plan-workspace **3**; drop-intent **39**; overflow-rehome **11**;
session-api-layout-cycle **30**; drag-drop **27**; plus reconcile/normalize/
open-min/min-tile/apply-structure/run/open/assert/r037. `typecheck:oh2` green.
Pytest TestWorkspaceScope + CLI copy **14**. Nest not run.

Stash dropped. Uncommitted; no commit/push.
