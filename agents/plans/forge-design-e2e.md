# forge-design-e2e — Design-sourced nest E2E tree

**Status:** Accepted (operator lock 2026-09-03)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-09-04
**Design:** D105 (visible settle); catalog testing.md 2.4.0 (black-box E2E,
story tree, expected-fail); forge [testing.md](../testing.md) nest
extension.
**Related:** [forge-proof-regression-loop.md](./forge-proof-regression-loop.md)
(loop runner — keep the loop, **replace** the case catalog if it is
code-shaped), [forge-core-slot-geometry.md](./forge-core-slot-geometry.md)
(host 1/3 is a **story**, not a helper patch).

## Leftover (this plan, not P0)

T0–T6 **landed**. SG6 product share fix landed (unit + nest open).
Host dock 1/3 still needs eyes. This plan’s leftovers:

1. Unimplemented `--rc` bodies. **Done this session:**
   `branch.open.launch-into-2slot-other-focus`,
   `branch.open.second-on-empty`,
   `branch.close.split-unit-peer`,
   `branch.open.empty-head-dock` +
   `leaf.open.pointer-on-tiled-stays-lft`,
   `branch.mark2.join-flatten`,
   `leaf.open.launch-next-to-tab-con`,
   `leaf.layout.apply-tab-open-leaf` (live **PASS**).
   `branch.open.launch-into-tab` live **PASS** (TAB insert; selected
   TAB CON still wraps — `leaf.open.launch-next-to-tab-con`).
   `branch.close.split-unit-peer` live **PASS** (unary collapse).
   `leaf.mark2.pointer-center-group` / `branch.mark2.group-tab`
   live **PASS** (wait Meta after presentWmSlots full dest; Expect
   FULL_LO unchanged).
   `branch.layout.extras-policy` live **PASS** (H(A,B)+extra D; park
   keep; `--clean` close). CLI `residual=park` without `--clean`
   honors park (NameError `clean_flag` in `_layout_run_multi` fixed).
   `branch.float.retile-into-tiles` live **PASS** (D032 unfloat
   slot-split). `branch.settle.buried-peer-background` live **PASS**
   (D105).
   `--rc` catalog bodies ready (`leaf.float.fail-safe-terminator` skip).
   `branch.layout.ws2-no-mutate-ws1` live **PASS** (PlaceNext PH by
   Forest `moNwsW`; late apply already-on-desk; Expect unchanged).
1. Tabs / join-enter **flake** (not XFAIL; do not weaken Expect).

## Goal

Nest is **meaningful E2E**: stories from **design**, product as a **black
box**, **tree** of trunk → branch → leaf, **RC = full tree**. Tests
change when design or a user-visible bug changes — **never** when code
needs a green.

A release-ready tip requires the **full nest tree** green (except
plan-named expected-fails for in-progress features).

## Operator locks (do not reopen)

1. **Design is the spec.** `design.md`, OpSet `mark2.md`, layout
   architecture in `project.md`, CHANGELOG newest row. Not
   `adapter-open-place.js`.
2. **Black box.** Gesture in; GetTree / Meta rect / TILE|FLOAT /
   identity / **visible** geometry out. No call-order E2E.
3. **Tree.** Day-to-day = lightest **trunk** for the blast radius.
   Fail → walk **down** that tree. RC = entire tree.
4. **Expected fail.** Partial feature may leave **its** story red if
   the plan names it. Unrelated trunk red = regression. Do not weaken
   the story.
5. **D105.** Invisible settle is allowed. Visible wrong is not.
6. **Host `layout dev` / personal profiles** stay human/host. Nest uses
   `_forge-test-*` only.

## Why this plan existed

2026-09-03 host `BVHnV`: `layout dev` left mon0 **50/50**, dock Nautilus
→ **1/3\|2/3**. Nest `smoke-close-reflow` was green. That smoke is
“3 TILE → **close** → 1/2” — a **different story**.

T0–T4 replaced that bag with a design story tree. Nest
`trunk.open.launch-into-2slot` now exists and **PASS**es for free-open
(`dock=false`). Host **dock** 1/3 remains product.

## Acceptance

- [x] Story catalog on disk, sourced from **design docs only**
      (`plans/forge-design-e2e/stories.md`). Each story: Given / Actions /
      Expect in tree language. **No** production function names as the
      contract.
- [x] Tree ids: `trunk.*` / `branch.*` / `leaf.*` (or equivalent).
      Document which trunk covers open, layout, close, tabs, Mark 2.
- [x] One runner: `--trunk <id>` (light), `--branch <id>`, `--rc` (full
      tree). Wired through `forge-test nested`.
- [x] **Required trunk (BVHnV):** 2-slot ~50/50 on one MONITOR → free-open
      a third client (Nautilus or extra Ghostty) with focus on one slot →
      **insert unit splits**; the **other** sibling keeps ~1/2 of the
      monitor; new+focus share that column — **not** 1/3\|2/3 of the
      whole monitor. Black-box: GetTree percents + Meta/rect widths.
      Nest live **PASS** (`dock=false`); host dock 1/3 still **product**.
- [x] D105 story: visible group correct while another slot still mapping
      does **not** fail the visible assert.
- [x] Old smokes mapped: keep / rewrite / delete. Inventory on disk.
- [x] RC path documented in `testing.md`. In-progress expected-fail
      recorded on the **plan**, not by commenting out stories.
      Hook plumbed; **zero** catalog `expected_fail`. `--rc` live is
      still unimplemented-red (not a green tree).
- [x] Catalog testing.md 2.4.0 + forge `testing.md` nest section
      already landed this session — do not revert.

## Implementation slices

| Slice | Who | Exit | Disk |
| --- | --- | --- | --- |
| **T0** | explore, grok-4.6 | Inventory current nest smokes vs design stories. Mark each: valid black-box / helper-mirror / missing. | `plans/forge-design-e2e/inventory.md` |
| **T1** | implement, grok-4.6 | Write `stories.md` **from design docs** (list below). Do **not** open `lib/extension/*` to decide what to assert. | `plans/forge-design-e2e/stories.md` |
| **T2** | implement, grok-4.6 | Harness: tree select + black-box oracles (tree, mode, identity, visible rect). Rebuild runner if `nest_proof.py` / one-off `nest_*_smoke.py` cannot express the tree without lying. | code + `harness.md` |
| **T3** | implement, grok-4.6 | Implement **trunk** including BVHnV launch-after-2-slot. May be red if product still 1/3 — **leave it red**, name it on this plan. Do not “fix” the story. | smoke + notes |
| **T4** | implement, grok-4.6 | Retire/rewrite old smokes per inventory. proof-loop suites = tree (trunk / rc). | code + inventory update |
| **T5** | implement, grok-4.6 | `--rc` full tree; expected-fail hook for in-progress (plan-named). `testing.md` cheat sheet if the run CLI changed. | code + docs |
| **T6** | orchestrator | **done** — HANDOFF: nest free-open green; host dock 1/3 is product; `--rc` unimplemented-red; tabs/join flake not XFAIL. | HANDOFF / this session note |

**Order:** T0 ∥ T1 (T1 must not wait on inventory to invent stories — stories
come from design; inventory only says what old scripts to kill). T2 after
T1. T3 after T2. T4 after T3 can run. T5 after T4. T6 last.

**T1 seed (expand from docs, do not copy smoke names):**

Given/Actions/Expect — start here, add only what **design** requires:

1. **Launch into a 2-child split** (D032, D090, D105) — BVHnV trunk.
2. **Close 1 of 3 equal tiles** → remaining fill (share repair).
3. **TABBED/STACKED** — one open leaf; peers share one slot; reveal
   does not shrink the pane (D069, D025).
4. **Layout apply** — one workspace; desired forest; missing roles
   open; extras per keep/close policy (`project.md` layout).
5. **Layout on WS2** does not mutate WS1 (workspace scope).
6. **Mark 2** Join / Move / Group (`mark2.md`).
7. **FLOAT** not under a MONITOR (D087).
8. **Empty-head / dock open** lands on the empty dest (D027).
9. **Visible group ready** while another mon still mapping — visible
   view already matches; do not require whole-desk quiet (D105).

## Do not

- Rewrite a nest story so current 1/3 launch goes green
- Patch-only `computeSizes` / dual chrome SoT and call E2E done
- Host `forge layout` / personal `dev`/`vinyl` from nest
- Dual-write Forest ← GObject; grow `live-handle.js`; invent `Mark2Drop*`
- Start **G8n-s2** as a substitute for the host dock 1/3 product fix.
  T3 exists and the nest free-open trunk is green; geometry is
  [forge-core-slot-geometry.md](./forge-core-slot-geometry.md).
- Spend orchestrator tokens re-reading `lib/extension/` — that is a
  child job, and **not** for writing stories

## Context for the next orchestrator

- Catalog: `agents/installed/testing.md` (2.4.0) — portable E2E law.
- Forge: `agents/testing.md` § Nest is the E2E (`--trunk` / `--rc`).
- Host evidence: HANDOFF `BVHnV` (layout 50/50 then **dock** Nautilus
  1/3). Nest free-open of the same D032 story **PASS**.
- Story tree: `scripts/forge/nest_stories.py`. Loop:
  `proof-loop --suite core`. `PROOF_CASES` is host/wake/tools only.
- Nest isolation / `--dev` TRACE / always-stop: still FIRM (`testing.md`
  Wayland workflow).
- Proto brake: `cd prototypes/container-motion && npm test` still
  required when touching kernel; not a substitute for nest stories.
- Next **product** plan: `forge-core-slot-geometry.md` (not a test
  rewrite).

## Session note

2026-09-04 — **T6** orchestrator HANDOFF. Nest E2E T0–T5 landed.
Green: free-open 2-slot trunk, close, layout, float, settle. Flake:
tabs + join-enter (not XFAIL). `--rc` unimplemented-red. Host dock
1/3 still product (`forge-core-slot-geometry`). Nest stopped. No
commit.

2026-09-04 — **T4** proof-loop suites = story tree (`core` = seven
trunks; `rc` = full tree; regression/chaos loop core). Old tiling
`smoke-*` are compat aliases to `--trunk`/`--branch`. Nest
`trunk.open.launch-into-2slot` `expected_fail=False`. Live
`proof-loop --suite core --iterations 1` started nest; first run FAIL
(join flake); keep-going 5/7 PASS (tabs+join flake vs T3). Nest
stopped. Host dock 1/3 still product. Next: **T5** `--rc`
expected-fail **semantics** (`--suite rc` live is unimplemented-red
until filled).

2026-09-03 — T0 inventory + T1 stories.md + **T2 harness** landed
(`plans/forge-design-e2e/harness.md`, `nest_stories.py`,
`nest_oracles.py`). `--trunk` / `--branch` / `--rc` + dry-run +
black-box oracles. Story bodies unimplemented (non-zero unless
`--dry-run`). Next was **T3**.
