# forge-cross-mon-empty-dest — Empty dest both directions

**Status:** landed (CME0–CME3)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-09-04
**Design:** Mark 2 Move empty-monitor + Join MONITOR edge transfer
(`mark2.md`). R015 / R022. D101 pointer `empty-monitor` → Move.
**Related:** [forge-design-e2e.md](./forge-design-e2e.md)
(`leaf.mark2.move-empty-monitor` exists, one direction).

## Goal

Crossing onto an **empty** second monitor works **both directions**
for pointer and keyboard, as if the dest MONITOR were just another
container:

1. DnD TILE from mon0 onto empty mon1 **and** mon1 onto empty mon0.
1. Keybind Join (and Move-at-edge) across the monitor barrier **both
   directions**. Dest empty → leaf lands TILE on dest; source unary /
   settle.

## Acceptance

- [x] L0: pointer `empty-monitor` Move A→empty Mon1 **and** B→empty
      Mon0. Dest has the leaf; source does not; both TILE
- [x] L0: keyboard Join at MONITOR edge both dirs onto empty dest
      (Join step 1 / `transferLeafToMonitor` `join:true`)
- [x] Nest `--monitors=2`: extend
      `leaf.mark2.move-empty-monitor` (or sibling leaves) so both
      directions are oracles — not XFAIL. Join empty-dest both dirs
      as a leaf under `trunk.mark2.join-enter`
- [x] Nested `dnd-drop --dest-monitor` both dest indices (tool, not
      the catalog name)
- [x] Nested leaf is **leaf-only** (R022): nested VSPLIT child does
      not drag the whole V
- [x] Proto brake green. Nest always stopped

## Context for the next agent (complete + succinct)

### Contract

```text
Given:   Mon0(H(A,B)) | Mon1()
Actions: Pointer empty-monitor grab=A onto Mon1
         # or Select(A); Move(right) at MONITOR edge
Expect:  Mon0(B) | Mon1(A)
         A, B TILE
```

```text
Given:   Mon0() | Mon1(H(A,B))
Actions: Pointer empty-monitor grab=A onto Mon0
         # or Select(A); Move(left) at MONITOR edge
Expect:  Mon0(A) | Mon1(B)
```

```text
Given:   Mon0(H(A,B)) | Mon1()
Actions: Select(A); Join(right)   # A at Mon0 right edge
Expect:  Mon0(B) | Mon1(A)
         Join empty dest is transfer, not a no-op
```

Same Join **left** from Mon1 onto empty Mon0.

`mark2.md` already: empty-monitor hit → `{ op: "move", args: { dir,
onto: monitorId } }`; Join step 1 MONITOR edge + neighbor → transfer
as join. This plan **locks both directions** in tests. Do not invent
a second empty-mon SurfaceOp.

### Proven / holes

- R015 shipped grab-end empty-mon + `dnd-drop destMonitor`.
- R022 leaf-only (not whole VSPLIT).
- Nest story `leaf.mark2.move-empty-monitor` is **one** Given
  (Mon0 occupied, Mon1 empty, A→Mon1). Reverse is missing.
- `transferLeafToMonitor` (`lib/opsets/transfer.js`) is the named
  helper. Pointer may skip inner-edge gate; keyboard Move still uses
  `isAtMonitorEdge`.
- Host historically: empty dest snap-back (R015). Operator wants
  regression **both ways** after R059/R060 cross-mon Group work.

### Paths / symbols

- `lib/opsets/mark2.js` — `mark2Move` MONITOR `onto`; `mark2Join`
  `isAtMonitorEdge` + `transferLeafToMonitor(..., { join: true })`
- `lib/opsets/mark2-pointer.js` — `hit.tag === "empty-monitor"`
- `lib/opsets/transfer.js` — `transferLeafToMonitor`
- Tests: `tests/unit/opsets/mark2-pointer.test.js`;
  `tests/regression/bug-r015-empty-mon-dnd.test.js` (extend reverse);
  proto mark2 if transfer cases live there
- Nest: `agents/plans/forge-design-e2e/stories.md` +
  `scripts/forge/nest_stories.py` / bodies
- Tool: `./scripts/forge/forge-test nested dnd-drop … --dest-monitor N`

### Implementation slices

| Slice | What | Exit |
| --- | --- | --- |
| **CME0** | Stories.md both-dir empty dest Move + Join (design spec) | Catalog has reverse **done** |
| **CME1** | Failing L0 / proto for reverse dest + Join empty both dirs | Red if reverse missing **done** |
| **CME2** | Product if L0 red (`transferLeafToMonitor` / pointer tag / Join edge). Do not grow host `_commitEmptyMonitorDrop` as a user path | L0 green; same-WS neighbor **done** |
| **CME3** | Nest `--monitors=2` new leaves; `dnd-drop --dest-monitor` both | Nest stopped **done** |

**Order:** CME0 → CME1 → CME2 (only if red) → CME3.

Shared-file note: `lib/opsets/mark2.js` is also
[forge-tab-group-insert-order.md](./forge-tab-group-insert-order.md).
**Serial with TGI** (TGI first). `stories.md` also owned by
design-e2e leftover — do not race nest bodies.

## Do not

- Branch: **master**. No commit/push unless operator asks
- Invent `Mark2Drop*`. No Forest←GObject dual-write. No
  `live-handle.js` growth
- Do not skip ROOT `move*`. Do not relocate dual-write into
  tree-api-nav
- Do not patch-only `computeSizes`. Do not ship whole-forest
  `MON_MISMATCH` RESYNC
- Do not reintroduce raw `move_to_monitor` at map. Do not port belt /
  Mode B / title→`renderTree` / entered-monitor maze
- Nest: `./scripts/forge/forge-test nested --trunk <id>` one CLI;
  hunt `forge-test nested log`; always stop nest. Agent does **not**
  host `layout`. Test layouts only `_forge-test-*`
- Install from `~/dev/me/forge` with `./install --dev` (TRACE)
- Proto brake: `cd prototypes/container-motion && npm test`
- Do not treat occupied dest-mon drop as this story (that is Group /
  Join onto a window)
- Do not XFAIL reverse if nest flakes — honest FAIL

## Enable / test

```text
cd prototypes/container-motion && npm test
npm test -- tests/unit/opsets/mark2-pointer.test.js \
  tests/regression/bug-r015-empty-mon-dnd.test.js
cd ~/dev/me/forge && ./install --dev
./scripts/forge/forge-test nested --trunk trunk.mark2.join-enter --monitors=2
# fail → leaf.mark2.move-empty-monitor + new reverse / join leaves
./scripts/forge/forge-test nested stop
```

## Session note

2026-09-04 — CME0–CME3. Empty dest both dirs locked (D112).

**L0:** `mark2-pointer` 36 pass (pointer reverse, Move onto empty both
dirs, Join both dirs, R022 nested leaf-only both dirs, Join does not
hop other-WS same-output MONITOR). Proto 165 pass (6 new empty-mon
cases). R015 reverse dest 2-tile pass (`empty mon0 rehomes`). Host
R015 nested VSPLIT `createNode(CON, {})` still TypeError on actor
getter (pre-existing; OpSet L0 covers R022).

**Product:** `neighborMonitor` / `orderedMonitors` /
`geometricNeighborMonitor` use same-WORKSPACE MONITOR peers. Pointer
empty-mon already Move `onto`. No `Mark2Drop*`, no `live-handle.js`,
TGI CENTER `place:"end"` untouched.

**Nest (`--monitors=2`, then stop):**
`leaf.mark2.move-empty-monitor` PASS;
`leaf.mark2.move-empty-monitor-reverse` PASS;
`leaf.mark2.join-empty-monitor` PASS (after same-WS neighbor).
dnd-drop dest 0 and 1 via those Move leaves. Nest **not** running.

**Stories:** additive reverse + Join leaves. Vinyl inkscape leaf kept.
