# Session — forge-design-e2e

**Updated:** 2026-09-04

`trunk.mark2.join-enter` `H(TAB,V)` vs `H(TAB(3),W)`: **harness Given**,
not Meta lag and not Join/Group mixup. CENTER Given made `TAB(D,C)`;
`Join(left)` on last child wrap-pairs (product). Given now uses bag
child order (C = left-edge). Isolated nest **PASS**. Not XFAIL.

## Leftover bodies (overnight)

**Green:** `branch.open.empty-head-dock`,
`leaf.open.pointer-on-tiled-stays-lft`,
`branch.mark2.join-flatten`,
`leaf.open.launch-next-to-tab-con`,
`leaf.layout.apply-tab-open-leaf`,
`branch.settle.buried-peer-background`.
**PASS:** `branch.open.launch-into-tab` — Launch next to WINDOW in TAB
inserts `TAB(A,C,B)` (mark2.md). Selected TAB CON still wraps.
`leaf.mark2.pointer-center-group` wait Meta **PASS**. Not XFAIL.
**Product (D027):** empty-head sticky-grace only (no map-time
`move_to_monitor`). FLOAT→TILE retile onto empty sticky dest.
**Honest FAIL:** also `branch.layout.extras-policy` — keep extras
closed D (2 TILE leftover 2/3\|1/3). Not XFAIL.
**PASS:** also `branch.float.retile-into-tiles` — D032 unfloat
slot-split (not even-thirds).
**Still unimplemented:** none on `--rc` (fail-safe skip).
`branch.settle.buried-peer-background` live **PASS**.
`branch.float.retile-into-tiles` live **PASS** (D032 unfloat).
Nest stopped. No commit.

---

## T6 — orchestrator HANDOFF

**Slice:** T6 **done**
**Disk:** `agents/HANDOFF.md`, `agents/PRIORITY.md`, this plan session
note.

**Green (nest):** `trunk.open.launch-into-2slot` (free-open,
`dock=false`, Expect unchanged), close, layout, float, settle.
**Flake (not XFAIL):** tabs, join-enter.
**Red (honest):** `--rc` unimplemented branches/leaves.
**Expected-red (host, not nest):** `BVHnV` dock Nautilus 1/3\|2/3.
**Next product:** `forge-core-slot-geometry.md` — not a test rewrite.
Nest stopped. No commit.

---

## T5 — `--rc` expected-fail hook + testing.md cheat sheet

**Slice:** T5 **done** (hook + docs; no live `--rc`; no product JS)
**Disk:** `harness.md` T5 semantics; `agents/testing.md` nest
entrypoints + cheat sheet
**Code:** `nest_stories.py` classify/score; `cmd_story_campaign` /
`proof-loop` XFAIL; units on dummy Stories (not catalog ids)

**Landed**

1. Ready story non-zero + `story.expected_fail` → print `XFAIL` /
   `expected-fail`; overall rc **not** red from that id alone.
   Unexpected fail still red. Unimplemented still `UNIMPLEMENTED_RC`
   (never xfail, even if the flag is set).
1. Catalog still **zero** `expected_fail`. Do not mark
   `trunk.tabs.open-leaf-one-slot` / `trunk.mark2.join-enter` XFAIL
   (T4 flake vs T3 PASS: `H(TAB,V) != H(TAB,WINDOW)`; TAB peers not
   one slot). Host dock 1/3 still product.
1. `agents/testing.md`: `--trunk` / `--branch` / `--rc` /
   `proof-loop --suite core|rc` are the catalog. `smoke-*` tiling
   names = T4 compat aliases. Tools: nest-apps, geom-epsilon,
   tabbed-edge. Isolation / `--dev` TRACE / always-stop / `nested log`
   / D105 unchanged.
1. Day-to-day `--trunk`; fail → walk down; RC = full tree except
   `leaf.float.fail-safe-terminator` unless fixture. Unimplemented =
   not release-ready.

**L0:** dummy Story xfail+pass → 0; unexpected fail → non-zero;
unimplemented → non-zero (`test_nest_stories.py`,
`test_nest_proof.py`).
**Dry-run:** `nested --rc --dry-run` and
`proof-loop --suite rc --dry-run` (no nest).

**Red expected:** none new. `--rc` live still unimplemented-red.
**Next:** **T6** orchestrator HANDOFF (green vs expected-red vs next
product fix — not a test rewrite).

---

## T4 — retire smokes; proof-loop = story tree

**Slice:** T4 **done** (catalog + aliases + rewrite-mapped branches)
**Disk:** `inventory.md` T4 fates; `harness.md` suites
**Code:** `nest_proof.py` suites from `nest_stories`;
`nest_story_bodies.py` rewrite-mapped branches; CLI smoke aliases.

**Landed**

1. `proof-loop --suite core` (alias `smoke`) = seven trunks via
   story runners + `run_campaign` always-stop **per case**.
1. `--suite rc` = full stories.md tree minus
   `leaf.float.fail-safe-terminator`. Unimplemented → non-zero, no nest.
1. `regression` / `chaos` loop the **core** trunk tree (documented).
   `wake-approx` / `host` unchanged. `--suite` still cannot combine
   with `--trunk` / `--branch` / `--rc`.
1. `PROOF_CASES` is host/wake/tools only — **not** the nest spec.
   Deprecated `N.*` / `smoke-*` tokens resolve to story ids.
1. `expected_fail=False` on `trunk.open.launch-into-2slot`. Expect
   unchanged. Host dock Nautilus 1/3 is **product**
   (`forge-core-slot-geometry`), not a nest expected-fail.
1. Compat aliases (print + `--trunk`/`--branch`):
   `smoke-close-reflow` → `trunk.close.three-equal-one-gone`;
   `smoke-mark2` → `trunk.mark2.join-enter`;
   `smoke-toggle-tab` → `branch.tabs.stacked-same-slot`;
   `smoke-layout-ws` → `branch.layout.ws2-no-mutate-ws1`;
   `smoke-layout-occupied` → `branch.layout.missing-roles-open`;
   `smoke-layout-dnd` → `leaf.mark2.move-empty-monitor`.
1. Tools kept, not `--rc`: `smoke-nest-apps`, `smoke-geom-epsilon`,
   `smoke-layout-tabbed-edge`. `invoke` / `dnd-drop` injectors kept.
1. Rewrite-mapped bodies (reuse T3 helpers; no product JS):
   stacked-same-slot, reveal-no-shrink, ws2-no-mutate-ws1,
   missing-roles-open, group-tab, move-swap, move-empty-monitor.

**L0:** `test_nest_stories.py`, `test_nest_proof.py`,
`test_nest_story_bodies.py` — catalog is story ids; core = trunks;
BVHnV `expected-fail: no`.
**Dry-run:** `proof-loop --suite core --dry-run` lists seven trunks
`status=ready`. `--suite rc --dry-run` lists 27 (fail-safe skipped);
unimplemented stay unimplemented.

**Live 2026-09-04** (`can_nested=true`; always-stop per case; final
`nested status` → `running: False`)

Required: `proof-loop --suite core --iterations 1` **started nest**.
First run (`until=fail`): FAIL at `trunk.mark2.join-enter` after
open/close/tabs/layout **PASS**. Isolated join retry FAIL. Later
keep-going subset: join **PASS**, float **PASS**, settle **PASS**.
Full keep-going 7: open/close/layout/float/settle **PASS**; tabs
**FAIL** (TAB peer rects not one slot); join **FAIL** (H(TAB,V) !=
H(TAB,WINDOW)). Join/tabs flake vs T3 PASS. Expect not weakened.
Hunt: `nested log` (TRACE not re-installed this slice).

| Trunk | T4 live |
| --- | --- |
| `trunk.open.launch-into-2slot` | PASS (`expected_fail=False`) |
| `trunk.close.three-equal-one-gone` | PASS |
| `trunk.tabs.open-leaf-one-slot` | flake (PASS then FAIL) |
| `trunk.layout.apply-one-ws` | PASS |
| `trunk.mark2.join-enter` | flake (FAIL, FAIL, PASS, FAIL) |
| `trunk.float.not-under-monitor` | PASS |
| `trunk.settle.visible-group-ready` | PASS |

**Red expected:** none on nest trunks (host dock 1/3 still product).
Join/tabs flake is **not** a story rewrite.
**Next:** **T5** `--rc` expected-fail semantics; `testing.md` cheat
sheet if the run CLI still lies.

---

## T3 — trunk bodies

**Slice:** T3 **done** (seven trunks registered + live nest)
**Disk:** `harness.md` T3 fill list; `scripts/forge/nest_story_bodies.py`
**Code:** `@story_runner` on all seven trunks; `cmd_story_campaign` live
path = `_cli_run` (always-stop unless `--keep` / `--keep-on-fail`);
`--monitors` = max of selected stories.
**L0:** `tests/unit/cli/test_nest_stories.py`, `test_nest_story_bodies.py`
(42 passed with oracles). Dry-run `--trunk trunk.open` → `status=ready`
`expected-fail: yes`.

**Landed**

1. `nest_story_bodies.py` — seven trunk bodies; `_forge-test-*` only
   (refuse `dev`/`t1`/`vinyl`).
1. Live `--trunk` starts nest via `nested_wayland._cli_run` /
   `run_campaign`. Unimplemented select (branches) still no nest.
1. Import runners from `nest_stories._ensure_runners`.
1. BVHnV Expect unchanged (`H(V(A,C),B)` + B ~1/2, not even thirds).

**Live 2026-09-03** (`can_nested=true`; always-stop; final
`nested status` → `running: False`)

| Trunk | Result |
| --- | --- |
| `trunk.open.launch-into-2slot` | **PASS** (unexpected vs host `BVHnV`). Nest `metric open dock=false class=null`; free-open third (Ghostty fallback if Nautilus stub). Expect not weakened. Catalog still `expected-fail: yes` (host dock Nautilus 1/3\|2/3). |
| `trunk.close.three-equal-one-gone` | PASS (seed `_forge-test-three-equal`; close → ~1/2) |
| `trunk.tabs.open-leaf-one-slot` | PASS (2-slot → launch peer → CENTER TAB; C ~1/2; one content rect) |
| `trunk.layout.apply-one-ws` | PASS (`_forge-test-one-ws` visible H ~50/50; forest-match log not the oracle) |
| `trunk.mark2.join-enter` | PASS (`invoke join.left` → `H(TAB(A,B,C),D)`) |
| `trunk.float.not-under-monitor` | PASS (`FloatToggle`; FLOATS / not MONITOR child) |
| `trunk.settle.visible-group-ready` | PASS (2 mon; `assert_visible_only` Mon0; Mon1 not a pass gate) |

**Red expected:** none this nest run. Host dock-open 1/3 is still the
plan-named product fail; nest free-open (dock=false) slot-split held.
**Next:** **T4** retire/rewrite old smokes; T5 `--rc` expected-fail hook.

---

## T2 — harness

**Slice:** T2 **done** (select + oracles + CLI; no live nest)
**Disk:** `agents/plans/forge-design-e2e/harness.md`
**Code:** `scripts/forge/nest_stories.py` (catalog + `--trunk` /
`--branch` / `--rc`), `scripts/forge/nest_oracles.py` (black-box
GetTree), `test_cli.py` / `nested_wayland.py` / `nest_proof.py` flags.
**L0:** `tests/unit/cli/test_nest_stories.py`, `test_nest_oracles.py`.

**Landed**

1. Catalog = every `trunk.*` / `branch.*` / `leaf.*` heading in
   stories.md (28). Parent/children walk-down. `--trunk` = that trunk
   only (prefix if unique: `trunk.open` →
   `trunk.open.launch-into-2slot`). `--branch` = branch + descendant
   leaves. `--rc` = full tree minus
   `leaf.float.fail-safe-terminator`.
1. Day-to-day: **`--trunk` required** (or `--branch` / `--rc`). No
   implicit story. Not legacy `PROOF_CASES` core.
1. `--dry-run` prints resolved ids, `expected-fail: yes` on BVHnV,
   exits 0. Non-dry-run unimplemented → **non-zero**.
1. Expected-fail flag **plumbed** on
   `trunk.open.launch-into-2slot` only. T5 wires `--rc` pass/fail.
1. Oracles: who-sits-where, TILE|FLOAT, wm-class/pid, fill-half vs
   third, D105 visible-only (missing other-mon does not fail).
1. `forge-test nested --help` documents the flags. `proof-loop` with
   story flags uses the story tree, not suite=regression smokes.
   `--suite` still the legacy bag until T4. `smoke-*` still exist.

**Unimplemented bodies (T3 fills; T2 exits non-zero unless dry-run):**
all 28 catalog ids. Register via `nest_stories.story_runner`.

**Red expected:** none in T2 (no live trunk). T3 may leave BVHnV red.
**Next:** **T3** implement trunk campaigns (including BVHnV). BVHnV may
stay red — do not rewrite the story. Do not start G8n-s2 / slot-geometry.

---

## T1 — stories.md

**Slice:** T1 **done**
**Disk:** `agents/plans/forge-design-e2e/stories.md`
**Done:** Design-sourced catalog (TOM / D032 / D090 / D105 / D069 /
D025 / D087 / D027 / D093 / Mark 2 / project.md layout). Tree ids
`trunk.*` / `branch.*` / `leaf.*`. Seeds 1–9 covered. **BVHnV**
`trunk.open.launch-into-2slot` is **expected-fail until product fix**
(plan lock). No `lib/` oracles. Nest `_forge-test-*` only.
**Red expected:** none in T1 (catalog only). T3 may leave BVHnV red —
do not rewrite the story.
**Next:** **T2** harness (tree select + black-box oracles). Do not
start T3–T6, G8n-s2, or slot-geometry product patches.

---

## T0

**Slice:** T0 **done**
**Disk:** `inventory.md`
**Next (when T1 wrote):** T1 was next; T1 now done → T2.

### Wrote

1. `agents/plans/forge-design-e2e/inventory.md` — every nest campaign /
   `PROOF_CASES` row classified; CLI aliases; harness vs catalog;
   T1 seed 1–9 coverage; BVHnV **missing**.

### Findings (for T1/T2)

1. **BVHnV (T1 seed 1) is missing.** No smoke is “2-slot ~50/50 on one
   MONITOR → free-open third → insert unit splits; other sibling keeps
   ~1/2.” `smoke-close-reflow` is the **other** story (3 TILE →
   **close** → ~1/2). layout-ws open-extra and tabbed-edge are also
   not that sequence.
1. **`PROOF_CASES` is a flat list of current scripts**, not the spec.
   `N.join-right` and `N.toggle-tab` are the **same**
   `nest_mark2_smoke.py` (env var). Each `smoke-*` alias ≡ `nested
   run -- python3 nest_*`. Keep `proof-loop` as **runner**; replace
   the case list with the T1 tree.
1. **Keep as runner (do not regress):** isolation, `./install --dev`
   TRACE, `nested run` always-stop, `nested log` (JSONL), `--monitors`,
   `_forge-test-*` only, `invoke` / `dnd-drop` as injectors, share
   oracles in `nest_proof.py` (fill-half bands).
1. **Rewrite:** close-reflow (oracles good), toggle-tab (partial),
   tabbed-edge (tree good), layout-ws/occupied/dnd (split; drop
   PlaceNext / `parentNode` / fingerprint-only as contract).
1. **Keep as tools, not stories:** `smoke-nest-apps` (isolation),
   `smoke-geom-epsilon` (D095 measure), host `H.*`.
1. **Also missing vs T1 seed:** 7 FLOATS, 8 empty-head/dock, 9 D105
   visible-group-while-other-mon-mapping. Seed 3 open-leaf/reveal
   only partial.

No nest smokes run this slice. No product JS. No commit.
