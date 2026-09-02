# forge-tab-open-leaf-visibility — Open leaf after layout + DnD join

**Status:** awaiting host verify  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-09-02  
**Regs:** **R054** (layout `active` / wrong visible tab after `layout
dev`) · **R055** (DnD into TAB does not raise/focus joiner)

## Goal

TABBED/STACKED **open leaf** (visible app + strip highlight) matches
intent after:

1. `forge layout …` profile `active` / focus settle
2. DnD CENTER join into an existing tab group (joiner becomes open
   leaf + keyboard focus)

## Acceptance

- [ ] After layout apply, each TABBED/STACKED group’s visible Meta +
  strip CSS track profile `active` (Forest `lastTabFocusId`), not a
  stale sibling / first child. *(L0 green; host `layout dev` pending)*
- [ ] DnD join into a tab group: joiner is open leaf, raised, and
  focused (`revealGroupChild` / keyboard path as product requires).
  *(L0 + nest tabbed-edge green; host DnD pending)*
- [x] `setOpenLeaf` (canonical writer) updates **Forest**
  `lastTabFocusId` then duck `lastTabFocus` — paint must not stomp.
- [x] L0 regression(s) fail before the patch for the user sequence.
- [x] Nest: relevant tab smoke still green (`smoke-toggle-tab` at
  minimum; DnD join smoke if present).

## Hypothesis (orchestrator triage)

| Path | What |
| --- | --- |
| **SoT** | Forest `CON.lastTabFocusId` is belief. Present /
  `liveTabOpenLeafForPresent` prefer Forest over duck. |
| **Gap** | `FocusManager.setOpenLeaf` only writes
  `parentNode.lastTabFocus` (Meta duck). Next `paintWmForest`
  projects Forest → duck and **clears or restores the old leaf**. |
| **Join** | Mark 2 `enter-con` / `wrapTwoLeaves` do not always
  `markOpenLeaf` / `setLastTabFocus` on the joiner. |
| **DnD** | `_commitDropMark2` + `runLiveForest` call
  `settleTabFocus` (raise via duck) but never
  `revealGroupChild({ keyboard: true })` for CENTER join. |

Canonical contracts: `docs/dev/contracts.md` § Open leaf;
`markOpenLeaf` / `setLastTabFocus` in `lib/tom/`.

## Implementation slices

| Slice | What | Status |
| --- | --- | --- |
| **OL1** | Make `setOpenLeaf` Forest-first (`setLastTabFocus` +
  duck). Keep TRACE. | done |
| **OL2** | Mark 2 Join: joiner is open leaf on enter/wrap when
  product expects it (`markOpenLeaf` / focus). | done (was already
  `keepLeafFocus` → `setFocus` → `markOpenLeaf`; now also in
  wrap/enter-con) |
| **OL3** | DnD CENTER join: after structure,
  `revealGroupChild(joiner, { keyboard: true, source: "dnd-join" })`
  (or equivalent that raises + focuses without double-commit). | done |
| **OL4** | Layout apply / soft settle: confirm focus/`active` path
  sticks after Forest write; fix if ApplyLayout still leaves wrong
  LTF. | done — `_focusOp` → `revealGroupChild` → `setOpenLeaf`;
  no ApplyLayout patch |
| **OL5** | L0 + nest + REGRESSIONS R054/R055 rows. | done |

## Do not

- Dual-write GObject child-lists / reconnect old handlers
- Grow `live-handle.js`
- Port belt / Mode B / title→`renderTree`
- Host `layout` from the agent (human verifies; nest for JS tip)

## Context for the next agent

- `lib/extension/focus.js` — `setOpenLeaf` / `_openLeafParent` /
  `updateTabbedFocus`
- `lib/extension/tom-live.js` — `liveTabOpenLeafForPresent`, paint
  LTF project (~1801), `forestIdFromLive`, `setLastTabFocus` import
- `lib/tom/kernel.js` — `markOpenLeaf` / `setFocus`
- `lib/opsets/mark2.js` — `joinLeafIntoCon` / `wrapTwoLeaves`
- `lib/extension/drag-drop.js` — `_commitDropMark2` CENTER
  `revealGroupChild` `source=dnd-join`
- `lib/extension/action-pipeline.js` — `revealGroupChild` /
  `settleTabFocus`
- Layout focus: `lib/shared/layout-plan.js` `focusActionsFromProfile`;
  `session-api` `_focusOp` / `_settleAfterRunSteps`

## Session note

**OL1–OL5 landed** on dirty `master` (not committed). Human still
must verify on host after `./install --dev` + Wayland re-login.

### What changed

1. **OL1** `FocusManager.setOpenLeaf` writes Forest
   `lastTabFocusId` via `setLastTabFocus` **then** duck
   `lastTabFocus`. TRACE unchanged (`lastTabFocus tab|stack`).
   Parent resolution: Forest live parent if TABBED/STACKED, else
   GObject `parentNode` (`_openLeafParent`). `updateTabbedFocus` /
   `updateStackedFocus` use the same parent so they do not skip
   `setOpenLeaf` when Forest MONITOR is still HSPLIT.
2. **OL2** `joinLeafIntoCon` + `wrapTwoLeaves` call `markOpenLeaf`
   on the joiner after settle-under. Join already did
   `keepLeafFocus` → `setFocus` → `markOpenLeaf`; L0 Join tests
   passed **before** this extra write. Proto checks lock it.
3. **OL3** `_commitDropMark2` CENTER (non-swap), after structure +
   STACKED→TABBED coerce: `revealGroupChild(joiner, { keyboard:
   true, source: "dnd-join" })`. No second structure commit.
4. **OL4** Layout `active` is `_focusOp` → `revealGroupChild`
   (`keyboard:false`). Once Forest write landed, L0 paint-stomp
   sequence is green. No ApplyLayout settle patch.

### Paths / symbols

- `lib/extension/focus.js` — `setOpenLeaf`, `_openLeafParent`
- `lib/tom/atomics.js` — `setLastTabFocus`
- `lib/tom/kernel.js` — `markOpenLeaf`
- `lib/opsets/mark2.js` — `joinLeafIntoCon`, `wrapTwoLeaves`
- `lib/extension/drag-drop.js` — `_commitDropMark2`

### Tests

- L0 `tests/regression/bug-r054-r055-open-leaf.test.js` — **failed
  then green** (setOpenLeaf Forest+paint; layout-active reveal;
  Join lastTabFocusId; DnD CENTER focus/activate).
- Blast: FocusManager, action-pipeline, forest-run, mark2-module,
  WindowManager-focus, log-contract hunt tokens — green.
- Proto `cd prototypes/container-motion && npm test` — 155 ok
  (incl. `join-enter-tab-from-left` / `join-tab-into-left-tab`
  lastTabFocus checks).
- Nest: `./install --dev`; `forge-test nested smoke-toggle-tab`
  PASS; `nested smoke-layout-tabbed-edge` PASS. Nest **stopped**.

### Host verify (human)

```sh
cd ~/dev/me/forge && ./install --dev
# Wayland: log out of GNOME, log back in
```

1. `forge layout dev` — each TAB/STACK strip + content match
   profile `active` (not first child / stale sibling).
2. DnD a TILE onto an existing TAB **CENTER** — joiner is the
   visible leaf, strip highlight, and keyboard focus.
3. Hunt: `forge log --grep 'lastTabFocus|revealGroupChild source=dnd-join' --level info+ --last 80`

Do **not** resave loadouts if the desk looks wrong.

### Residual

- `bug-d5mm-focus-restack` still fails: GObject `parentNode` null /
  MONITOR-as-TAB vs Forest wrap (D100 fixture rot, not this pair).
- Many `WindowManager-drag-drop` LEFT/RIGHT cases still
  `Forest ids miss; fail closed` (pre-existing D100, not OL).
- Host chrome open-leaf is still the authority for R054 visual.
