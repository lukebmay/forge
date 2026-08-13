# forge-test-suite-honest-analysis — Tests that prove product, not patches

**Status:** done
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

- [x] Written inventory: which suites exist, what they actually execute,
      what they never touch (dual-mon open, nested DnD, first layout
      paint, monitor-parent drop)
- [x] Rubric for a “real” regression test (observable forest / GetTree /
      mode after the gesture; forbidden: call-order, “homes to mon 0
      because fixture pointer is 0”, parent.layout alone)
- [x] Ranked list of existing tests that are green-for-the-wrong-reason
      (seed: `bug-tnth`, R015 flat-only, comprehensive DnD CON-only,
      drop-intent without execute)
- [x] Plan to convert or replace the worst offenders (do not mass-rewrite)
- [x] Rule for agents: new live bug → failing test **before** the patch,
      written against the user sequence
- [x] Optional: lint/heuristic that flags tests asserting only
      `toHaveBeenCalled` / layout string without child identity
      — **skipped** (not cheap / high-signal enough)

## Context for the next agent (complete + succinct)

### Rubric (on disk)

- [agents/testing.md](../testing.md) § Real regression tests (FIRM)
- Pointer: [tests/README.md](../../tests/README.md) § Writing Tests

### Inventory (do not re-sample)

| Suite | What it runs | What it never touches |
| --- | --- | --- |
| `tests/unit/**/*.test.js` | Vitest + GNOME mocks. Pure helpers and WM methods | Real Meta, dual-4K geometry, host paint |
| `tests/regression/*.test.js` | Same runner; one-bug files. Many post-patch mirrors | Same |
| `tests/integration/window-operations.test.js` | Real `tree.processNode` rects on fixture tree | Gestures, dual-mon, apply |
| `tests/unit/cli/*.py` | pytest: layout apply, jobs, live_matrix, nest | Extension JS forest |
| `tests/e2e/` | Docker/GNOME workflows (agent-rare) | Host dual-mon RC |
| `tests/meta-probe/` | Forge-independent Meta settle timings | Product forest |
| `LIVE_CASES` (~19) | `forge test live` L1/L2. Several `*-note` actions are **notes**, not runners | Dual-mon open / nested DnD / first paint / monitor-parent drop unless a human runs the note |

**Gap table (user-visible paths still thin after L0 guards):**

| Path | L0 that exists | Still missing |
| --- | --- | --- |
| Dual-mon open onto **empty dest** | `bug-r021-r024`, OP1 `pointer on empty mon1`, rewritten tnth | Live runner (R021 is a `*-note`) |
| Nested leaf → empty dest | R015 nested + R022 | Host drag (R022 is a `*-note`) |
| First layout TILE **paint** | R024 RunSteps force-commit + batch TILE | First apply dirty→geometry (not just `_freezeRender`) |
| Monitor-parent nest drop | R023 in comprehensive + r021-r024 | Cross-mon nest onto MONITOR parent |

### Sample 28 files (contract / patch-mirror / vacuous)

| File | Class | Why |
| --- | --- | --- |
| `bug-tnth` (was seed) | was coincidence; **1 test now contract** | Pointer always 0 == mon0 dump |
| `bug-r015` (was seed) | mixed; nested + rewritten R012 **contract** | First test still flat-only; resolveEmpty* is pure |
| `WindowManager-drag-drop-comprehensive` | mixed; **1 peel now contract** | Many `toHaveBeenCalled` / `parent.layout` / CON-only |
| `drop-intent` (was seed) | mixed; **1 CENTER now executes** | Rest is boolean-only (OK for remaining helper cases) |
| `bug-299` | patch-mirror / coincidence | `no LFT → mon 0` while pointer is 1 — fights D027 |
| `WindowManager-open-app-policy` | mixed / mostly contract | R021 empty dest is honest; `no LFT → mon 0` is not |
| `bug-r021-r024` | contract (R021–R023); R024 patch-mirror | R024 asserts `commitLayout(..., {force})` |
| `bug-r012` | mixed | Center join is forest; grab-end **mocks** `moveWindowToPointer` |
| `WindowManager-drag-drop` | mixed; **1 LEFT-in-V now contract** | Sibling tests still `parent.layout` only |
| `bug-213` | contract | Sibling identity after `tree.move` |
| `bug-057` | contract | Nested CON identity after layout toggle |
| `bug-351` | patch-mirror | `move_resize_frame` spies (close to “no jank”) |
| `bug-w-render-storm` | patch-mirror | `renderTree` / `requestLayout` spies |
| `bug-461` | mixed | Mode + frame size honest; `reassertNodeToSlot` spy |
| `bug-tab-click-activate` | vacuous / patch-mirror | First test is call-order; stacked child-order is honest |
| `drop-zones` | contract (pure) | Zone geometry |
| `lft-mru` | contract (pure) | Placement plan |
| `run-steps` | contract (pure) | Parse / validate |
| `integration/window-operations` | contract | Computed rects |
| `bug-530` | patch-mirror | `remove_all_transitions` spy |
| `bug-tz-tab-apply-flatten` | contract | Flatten to one TABBED bag |
| `forge-lx3-cross-mon-move` | contract | Nested leaf crosses mon |
| `forge-d4-cross-mon-dnd` | mixed | Hit + preview spies |
| `bug-r016` | mixed | Homes + `renderTree` spy |
| `bug-r017` | patch-mirror | `updateMetaWorkspaceMonitor` spies |
| comprehensive SWAP / tabbed RIGHT/TOP/BOTTOM | vacuous | `toHaveBeenCalled` only |
| comprehensive CON LEFT/TOP | patch-mirror | `parent.layout` only (CON wrap, no MONITOR) |
| live `L1.r021` / `r024` / `r026` / `r027` | notes | `actions=(*-note)` — not a runner |

### Ranked remaining worst (do not mass-rewrite)

1. comprehensive tabbed RIGHT/TOP/BOTTOM — still `split()` spy only
1. `bug-tab-click-activate` first test — call-order
1. `bug-r012` grab-end — mocks the drop SUT
1. `bug-299` / OP1 `no LFT → mon 0` — mon0 coincidence vs empty-head
1. comprehensive SWAP — `swapSpy` only
1. R024 in `bug-r021-r024` — `commitLayout` spy, no TILE rect
1. `bug-w-render-storm` / `bug-r017` — spy-only layout

R015 nested test was **already honest** (R022). Rewrote the R012 spy
case in that file instead of duplicating the nest.

### Five rewrites (prove the rubric)

| File | Test | Now asserts |
| --- | --- | --- |
| `bug-tnth-new-window-placement` | pointer on empty dest | Open lands on empty mon1; LFT stays on mon0 |
| `bug-r015-empty-mon-dnd` | entered-monitor mid-grab | Source parent/sibling/mode; dest empty |
| `WindowManager-drag-drop-comprehensive` | TABBED LEFT peel | Remaining tabs stay; dragged HSPLIT CON is left of them |
| `drop-intent` | CENTER on VSPLIT | Executes drop → TABBED, both identities |
| `WindowManager-drag-drop` | LEFT in VSPLIT | Nest HSPLIT [dragged, target]; sibling stays on mon VSPLIT |

```bash
npm test -- tests/regression/bug-tnth-new-window-placement.test.js \
  tests/regression/bug-r015-empty-mon-dnd.test.js \
  tests/unit/window/WindowManager-drag-drop-comprehensive.test.js \
  tests/unit/extension/drop-intent.test.js \
  tests/unit/window/WindowManager-drag-drop.test.js
# 5 files, 110 tests, green
```

### Next (if continuing honesty)

Rewrite **one** of ranked #1–#3. Do not scan the suite again. Do not
implement container insert / tree motion. No lint.

## Session note

Inventory + ranked list + 5 forest rewrites landed. Rubric in
`agents/testing.md` (wins over installed). Optional lint skipped.
`npm test` on the five files: **110 passed**.
