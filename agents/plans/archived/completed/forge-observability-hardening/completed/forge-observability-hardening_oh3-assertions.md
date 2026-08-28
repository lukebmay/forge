# forge-observability-hardening_oh3-assertions — Debug/trace assertions

**Status:** done  
**Plan:** [forge-observability-hardening](../../forge-observability-hardening.md)  
**Branch:** master  
**Blocker:** (none)  
**Priority:** **P0**  
**Model:** **Grok 4.6**  
**Reasoning:** **high**  
**Updated:** 2026-08-21

## Goal

Add a shared assertion helper used on programmer invariants (tree parentage,
workspace membership, monitor indices, grab ownership, apply-epoch exclusivity)
with best-practice gating: **active in debug/trace (dev)**, **noop** at normal
info-and-below product levels so hot paths stay cheap.

## Model rationale

Assert policy (throw vs log-and-continue, production gating, interaction with
plog levels) is an architecture lock. **4.6 high** for the API + first hot-path
wiring; further peppering can continue under **4.5**.

## Locked policy (operator ACK 2026-08-21)

| Rule | Detail |
| --- | --- |
| **When active** | `log-level >= debug` **or** `!production` (dev install). At info-and-below in production → **noop**. |
| **On failure (active)** | **plog error** (invariant name + key ids) + set **`assertionFailed` global flag**. **Never throw** — throwing risks Shell logout / login loops (untenable). |
| **After flag** | Rest of code **stops gracefully** (skip further mutate / apply / grab commits) so the operator can address the failure without endless restarts. |
| **Do not** | Use asserts as the only user-facing validation of bad profile JSON / DBus input — those stay normal errors. |
| **Do** | Assert internal invariants after mutations: non-null parent after insert, window’s workspace matches apply ws, grab node matches `_draggedNodeWindow`, mon index in range, epoch live XOR restore path, etc. |
| **Messages** | Stable short code + structured fields (ws, mon, windowId, slot) so traces correlate with plog lines. |

## Acceptance

- [x] Shared module (e.g. `lib/shared/assert.js`) with `assert(cond, msgOrFields)`,
  maybe `assertEq` / `assertNe` — documented
- [x] Gated: noop when inactive; when active → plog error + set global failure flag (**no throw**)
- [x] Unit tests: active vs noop; failure logs; **never throws**; flag readable/clearable for tests
- [x] Call sites honor `assertionFailed` (graceful stop) on at least apply / DnD commit / launch insert
- [x] Wired into high-value invariants (minimum set):
  - tree child-list ops / parent consistency after mutate
  - apply snapshot workspace filter (no cross-ws claim when applying one ws)
  - DnD grab ownership (`_draggedNodeWindow` vs focus)
  - monitor index bounds / same-mon group home
  - launch insert branch preconditions
- [x] Docs: one short row in contracts or DESIGN — when asserts run; graceful-stop flag; how to enable
- [x] No assert-only “fixes” that swallow product bugs silently when noop’d

## Context for the next agent (complete + succinct)

### API

`lib/shared/assert.js` — gi-free helper (imports `production` + plog-adapter like
the logger). Never throws.

| Export | Role |
| --- | --- |
| `assert(cond, codeOrFields, fields?)` | true if ok or inactive; false on failure |
| `assertEq` / `assertNe` | Object.is compare |
| `assertApplyForestWorkspace(forest, ws)` | monitors’ `moNwsW` must match apply ws |
| `isAssertActive()` | `!production` **or** `effectiveLevel() >= DEBUG` |
| `assertionFailed()` | graceful-stop flag |
| `clearAssertionFailed()` / `resetAssertForTests()` / `setAssertActiveForTests(v)` | tests |
| `ASSERT_FAILED_CODE` | `"assert-failed"` (apply terminal / DBus) |

Failure: `plog.error("assert", { code, ...fields })` then set flag.

**Does not** walk `orphanWindows` — that is the parked ws-orphan product bug
(`stash@{0}` `36e02b267c1c2605ebd9e555d4d3d285aad9a751`). Asserting it would halt
every multi-ws apply in debug only.

### Call sites

| Path | What |
| --- | --- |
| `tree.js` Node `appendChild` / `insertBefore` / `removeChild` / `replaceChildren` | `tree-parent` / `tree-child-list` after mutate |
| `tree.js` `groupHomeMonitor` / `insertWindowIntoGroup` | `mon-bounds` / `group-home-mon` |
| `session-api.js` `_snapshotForestForApply` + `tree-query.js` `projectForest` | `apply-ws-filter` on monitors |
| `layout-apply-run.js` start / `_advance` / `_runPhaseWork` | skip/abort with `code: assert-failed` |
| `session-api.js` `ApplyLayout` / `_runApplyLayoutSteps` | skip; wrap step handlers so later ops stop |
| `drag-drop.js` grab-begin / `moveWindowToPointer` commit / grab-end / empty-mon | `dnd-grab-owner`; skip commit |
| `window.js` `trackWindow` / `slotSplitForInsert` / `_maybeAspectSplitForOpen` / `_rehomeAttachAfterMonLft` / `_adoptOpenIntoTileSlot` | skip insert; `launch-insert-target` / `launch-insert-parent` |

Production (`settings.js` `production === true`) → `effectiveLevel()` OFF →
asserts **noop**. Dev install / `make debug` (`production = false`) → always
active. Host DEBUG gsettings cannot turn asserts on while `production` is true
(same as logger).

### Tests (L0)

```bash
npm test -- tests/unit/shared/assert.test.js tests/unit/shared/plog-adapter.test.js \
  tests/unit/shared/logger.test.js tests/unit/tree/Node.test.js \
  tests/unit/extension/layout-apply-run.test.js tests/unit/extension/tree-query.test.js \
  tests/unit/tree/Tree-operations.test.js tests/unit/tree/Tree-layout.test.js \
  tests/unit/window/WindowManager-insert-slot-split.test.js \
  tests/unit/window/WindowManager-open-app-policy.test.js \
  tests/unit/window/WindowManager-drag-drop.test.js \
  tests/unit/window/WindowManager-normalize-group-home.test.js \
  tests/unit/extension/layout-apply-structure.test.js \
  tests/unit/extension/layout-apply-open.test.js
```

Green this session: assert **10** + Node OH3 path + apply-run skip/abort +
tree/DnD/insert/open/apply focused **250** + extra DnD **110**. Nest not required.

### Next

**OH2** checkJs — [task](../../../tasks/forge-observability-hardening_oh2-typescript-checkjs.md).
JSDoc on `assert.js` is already present. Do not mix parked ws-orphan stash.

## Session note

2026-08-21 — Landed `lib/shared/assert.js` (log+flag, never throw). Wired tree
parentage, apply-ws filter (monitors only), DnD grab owner, mon/group home,
launch-insert preconditions. Graceful stop on apply / DnD commit / launch
insert. Docs: contracts row + DESIGN production paragraph + troubleshooting.
Uncommitted on master with OH1. stash@{0} ws-orphan **not** dropped.
