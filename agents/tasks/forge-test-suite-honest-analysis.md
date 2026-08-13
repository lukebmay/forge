# forge-test-suite-honest-analysis — Tests that prove product, not patches

**Status:** ready
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

Audit the unit / regression / live matrix suites and produce a plan so
new tests fail when the **user-visible contract** breaks — not when a
helper’s current internals change, and not when we write the assertion
that the implementation already satisfies.

## Acceptance

- [ ] Written inventory: which suites exist, what they actually execute,
      what they never touch (dual-mon open, nested DnD, first layout
      paint, monitor-parent drop)
- [ ] Rubric for a “real” regression test (observable forest / GetTree /
      mode after the gesture; forbidden: call-order, “homes to mon 0
      because fixture pointer is 0”, parent.layout alone)
- [ ] Ranked list of existing tests that are green-for-the-wrong-reason
      (seed: `bug-tnth`, R015 flat-only, comprehensive DnD CON-only,
      drop-intent without execute)
- [ ] Plan to convert or replace the worst offenders (do not mass-rewrite)
- [ ] Rule for agents: new live bug → failing test **before** the patch,
      written against the user sequence
- [ ] Optional: lint/heuristic that flags tests asserting only
      `toHaveBeenCalled` / layout string without child identity

## Context for the next agent (complete + succinct)

### Why this is needed (seed from R021–R024)

The 2026-08-13 nautilus dual-mon bugs were all next to “guard” tests
that stayed green:

| Area | What the test locked | What the user needed |
| --- | --- | --- |
| New-window mon | `tnth` “pointer” with **no LFT** (mon0 coincidence); OP1 tests never used an **empty dest mon** | Pointer/dock on empty head must not attach left end-of-tree |
| Empty-mon DnD | R015 two **flat** siblings; never a VSPLIT child; never sibling Meta mon = dest | Leaf-only move when dragging out of a nest |
| Edge drop nest | Comprehensive suite wraps a **CON**; asserts `dragged.parentNode.layout === VSPLIT` | MONITOR-direct HSPLIT + BOTTOM → nested VSPLIT, sibling stays out |
| First `layout` | RunSteps skipped commit when freeze leftover; no test started apply dirty | First apply paints TILE geometry |

**Root habit:** tests are authored *after* the patch, against the
function just changed, with fixtures that only exercise the path that
was already correct. They document the patch, they do not reproduce the
desk.

Related FIRM text already exists (`agents/testing.md` pyramid,
`project.md` “do not treat unit tests as layout sign-off”) and was not
followed for these four.

### Proven this session

- `resolveOpenAppPlacement` ignored pointer/window empty-head
- `_commitEmptyMonitorDrop` called `_rehomeWindowPreservingContainer`
- `_executeDropOperation` reused MONITOR when `numWin === 2`
- RunSteps preserved leftover `_freezeRender` and skipped commit

Fixes + L0 guards: [forge-dual-mon-open-drop-layout](./forge-dual-mon-open-drop-layout.md).

### How to work this task

1. Sample 20–30 regression files: classify each as contract / patch
   mirror / vacuous (assert counts only, mock the SUT).
2. Write the rubric into `tests/README.md` or `agents/testing.md`
   (short; no novel).
3. Pick 5 worst files and rewrite **one** test each as a user-sequence
   forest assert (prove the rubric).
4. Do **not** chase coverage %. One test that would have failed on the
   live bug beats 20 helpers.

### Enable / test

No product code required for the analysis doc. If rubric tests are
rewritten: `npm test -- <those files>` must stay meaningful if the
implementation is inverted.

### Risks

- Mass rewrite of 100+ `bug-*` files is a token sink and will re-encode
  today’s code. Prefer a rubric + staged replacements.
- Live matrix catalog entries without a runner action are notes, not
  tests — call that out; do not add more paper cases.

## Session note

Opened after R021–R024. Seed table above is the starting evidence.
Do not treat L0 green as “the suite is healthy.”
