# forge-live-tom-cutover — Live Forest as sole topology

**Status:** archived completed — C0–C7 landed; **GObject deletion unfinished**
**Superseded for leftovers by:** [forge-retire-gobject-topology](../../forge-retire-gobject-topology.md) (**D096**, 2026-08-31)
**Branch:** master
**Lock:** **D092** (2026-08-29); wording amended by **D096**
**Blocker:** [blockers/live-tom-cutover-design.md](../../../blockers/live-tom-cutover-design.md) — **closed**
**Updated:** 2026-08-31 — archived. Do **not** extend C7 “Host/helper”
residue here; all dual child-list work is G1–G8 on the retire plan.
**Audit:** [forge-firm-abstractions/explore/08-tom-sole-source-audit.md](..../forge-firm-abstractions/explore/08-tom-sole-source-audit.md)

## Goal

Make **TOM Forest the sole live topology** for Forge proper. Durable
nanoid per node; adapter `Map<id, bag>` for Meta/St/volatile host facts;
live FLOATS bag (D087); TOM↔reality reconcile with FLOAT fail-safe;
Apply desired state is TOM. **Big bang** — delete dual-run as the
steady state. No back-compat obligation.

## Acceptance

- [x] Design meeting + **D092** + `design.md` guiding text
- [x] Kernel ids are nanoid (not projection `nN` churn)
- [x] Live WM holds one Forest; Mark 2 mutates it in place (transact OK) — C3.1–C3.6; paint mirrors chrome
- [ ] Host facts only via `Map<id, bag>` — no Meta on topology nodes
- [x] Live FLOATS bag; no ROOT parking — park removed in C3.6; C4 FLOATS paint + membership
- [x] Reconcile loop: apply → if host rejects → RuleSet/policy adjust →
      retry; FLOAT always available as fail-safe — C5 (`lib/extension/reconcile.js`)
- [x] Apply (ex-P5c) plans against TOM IR (C6.1–C6.4); restore deep path C6.5
- [x] GObject `Node`/`Tree` no longer authority for topology —
      leftover Host/helper + id-miss fallbacks + unseeded restore
      (honest, not dual-run)
- [x] Proto brake green (154); forest-apply-snapshot + apply units; nest optional

## Non-goals (judgement)

- Pinned-slots / resize-autotile redesign (separate blockers)
- Renaming `WindowManager` class → ForgeAdapterGnome (role already D085)
- Preserving GetTree JSON as a second TOM language
- Incremental dual-run forever / BC shims for old CON `nN` / Meta-on-node

Keep if still useful: D023 child-list discipline on whatever paint
handles remain; majority vs strict monitor resolve split; proto tests as
kernel brake.

## Architecture target

```text
          OpSet / RuleSet / TomApi
                    │
                    ▼
          Live Forest (POJO)     ◄── sole topology
          META + FLOATS + TILES
                    │
         Map<nanoid, hostBag>   ◄── ForgeAdapterGnome fills
                    │
                    ▼
          paint / signals / Meta
```

**Reconcile:**

```text
mutate TOM → paint/apply to host
  → host OK? done
  → else adjust TOM (rules) → retry
  → FLOAT fail-safe if TILES placement impossible
```

## Slices (priority order)

| Slice | What | Depends | Status |
| --- | --- | --- | --- |
| **C0** | Design meeting + D092 | — | **done** |
| **C1** | Kernel: replace `n${seq}` factory with **nanoid**; hydrate/clone preserve ids; proto + unit tests green | C0 | **done** |
| **C2** | `lib/` host-bag module: `Map<id, bag>` API (get/set/delete/clear); Gnome adapter owns instance; no Meta on nodes | C0 | **done** (`lib/host/`) |
| **C3** | Live Forest ownership: WM/session holds Forest; `runLiveForest` stops project-from-GObject (mutate live / transact); peel `tom-live` project path | C1, C2 | **C3.1–C3.7 done** |
| **C4** | Live FLOATS bag + stop ROOT parking; float mode ↔ FLOATS membership | C3 | **done** |
| **C5** | Reconcile loop + FLOAT fail-safe on apply/paint constraints | C3, C4 | **done** |
| **C6** | Apply / epochs: desired + portable key = node nanoid; retire GetTree-as-TOM planner (ex-P5c) | C3 | **C6.1–C6.6 done**; C6.7 optional brake |
| **C7** | Delete topology authority of `tree.js` `Node`/`Tree`; retarget finders, RunSteps, open, DnD paint, tests; actors keyed by id | C3–C6 | **C7.1–C7.7 done** |

Parallel: **C1 ∥ C2**. Then **C3**. Then **C4 ∥ C5 ∥ C6** where files do not collide. **C7** last (deletion pass).

## C1 detail — nanoid

- **Done.** `makeIdFactory().nid()` → `lib/tom/nanoid.js` (URL-safe,
  21 chars; `crypto.getRandomValues` when present, else `Math.random`).
  Node + GJS; no npm `nanoid` import from GJS.
- `hydrate(f)` no longer scans `/^n(\d+)$/`; syncs unused `_seq` only.
- Envelope singletons META / FLOATS / ROOT keep literal ids
  (`META_ID` / `FLOATS_ID` / `TILES_ID`).
- Explicit ids still OK (tests/shorthand; `createForest` WS1 / geom mon
  ids; projection WINDOW Meta id until C3/C6).
- Projection CON path (`tom-live`) also uses `ids.nid()` (no `nN`).
- Discard forge `moNwsW` as **identity** remains C3+ (projection still
  may emit `mo*`/`ws*` for MONITOR/WORKSPACE until live Forest owns ids).
- Proto brake: `cd prototypes/container-motion && npm test` → 154.

## C2 detail — host bag

- **Done:** `lib/host/bag.js` (`createHostBag`) + `lib/host/index.js`.
  Unit: `tests/unit/host/bag.test.js`.
- `Map<string, object>`; values may hold `meta`, `actor`, `windowId`
  (Meta.get_id), chrome refs, etc.
- API: `get` / `set` (shallow merge) / `delete` / `clear` / `entries` /
  `has` / `size`; reverse `idFromMeta` / `idFromWindowId`.
- WeakMap-by-string is impossible in JS — use Map; GC by deleting entries
  when nodes are destroyed.
- Session/world stay Forest-keyed WeakMaps (D082/D083) — different bags.
- C3: WM owns one `createHostBag()` instance; peel Meta off nodes into it.

## C3 detail — live Forest

- One Forest per live session (or per WM).
- Mark 2 / TomApi: clone+commit transact against that Forest (existing
  `transact.js` pattern) — **not** `projectLiveForest` from GObject.
- `applyLiveForest` becomes paint/reconcile from Forest + host bag, not
  topology write-back onto GObject children as source of truth.
- Focus/selection = Forest `focusId` / `selectionId`; host focus follows.

### C3.1 + C3.2 (done 2026-08-29)

- WM owns `forest` (envelope + nanoid factory), `hostBag`, `liveById`.
  Construct creates empty envelope; `disable` clears bag + nulls forest.
  Tree getter recreate restores bag/forest if missing.
- **Bootstrap:** one-shot `projectLiveForest` via `seedLiveForest` /
  `ensureLiveForest`. Cold enable / first Mark 2; warm
  `trackCurrentWindows` uses `syncForestFromTree` (preserve nanoids).
- `runLiveForest` mutates `wm.forest` (no per-op project).
  `paintLiveForest` (alias `applyLiveForest`) paints from Forest + bag;
  `rebuildLiveById` maps WINDOW via bag→`findNode`, CON via bag actor.

### C3.3 + C3.4 (done 2026-08-29)

- **C3.3:** `seedLiveForest` remaps projected WINDOW Meta-windowId keys →
  nanoid; `hostBag` stores `{ meta, windowId }`; `liveById` WINDOW via
  bag→`findNode(meta)`; `resolveForestFocusId` bag-only (no Meta-as-id
  fallback); invent-CON during apply registers chrome in bag.
- **C3.4:** runner already sets `forest.focusId` / `selectionId` and
  raises host Meta from `liveById.get(focusId)` — marked done.

### C3.5 (done 2026-08-29)

- **Open:** `trackWindow` → `forestInsertWindow` (nanoid WINDOW under
  MONITOR, or FLOATS when open-min-float / non-tile); `hostBag` +
  `liveById`. Tom atomics append (not full Mark 2 Launch — open/LFT
  still places on GObject; C7 peel).
- **Destroy:** `windowDestroy` → `forestRemoveWindow` then GObject
  remove; bag + liveById cleared.
- **Spine:** `forestEnsureSpineNode` on WS/mon create (no-op until
  seeded — avoids Tree ctor recursion); `syncForestFromTree` on
  `trackCurrentWindows` (warm) + monitor-recovery settle paths;
  `preserveHostIds` keeps WINDOW nanoids.
- **Re-seed:** cold only (`ensureLiveForest` when `!_liveForestSeeded`).
  No force clear after every track.

### C3.6 + C3.7 (done 2026-08-29)

- **C3.6:** `paintLiveForest` — layout/percent/userSized from Forest;
  CON chrome via `hostBag.actor` before invent; TILES
  `replaceChildren` is **paint mirror** (Forest already mutated).
  **Stopped ROOT-parking FLOATS** — detach from TILES parents only;
  `TODO(C4.1)` float paint from FLOATS + bag.
- **C3.7:** proto **154**; `tom-live.test.js` **21**; CommandHandler
  Mark 2 green (**78** in file). Nest smoke optional later.
- Next: **C4** FLOATS membership / float paint.

### C3 substeps (from explore/09)

| Sub | What | Status |
| --- | --- | --- |
| C3.1 | `wm.forest` + `wm.hostBag`; seed; disable clears | **done** |
| C3.2 | `runLiveForest` mutates `wm.forest`; interim apply-back | **done** |
| C3.3 | `liveById` / WINDOW id from host bag (nanoid) | **done** |
| C3.4 | focus/selection from Forest ids | **done** |
| C3.5 | open/destroy/WS/mon Forest-first writers | **done** |
| C3.6 | demote apply to paint/reconcile (hand FLOATS remainder to C4) | **done** |
| C3.7 | brake pack (tom-live + CommandHandler + nest smoke) | **done** (units; nest optional) |

C3 complete — C4–C6 may edit `tom-live` / `forest-run` / WM forest.

## C4–C5 detail — FLOATS + reconcile

Longer note:
[forge-firm-abstractions/explore/10-c4-c5-floats-reconcile.md](.../forge-firm-abstractions/explore/10-c4-c5-floats-reconcile.md).

**Gate:** C3.6 landed (paint-only; ROOT-park removed). C4 owns FLOATS
paint + membership. C3.3 WINDOW ids + C3.5 Forest-first open/destroy
are in place for float writers.

**Law:** WINDOW floats iff `parentId` is FLOATS. Re-tile = **Launch** /
**Join** into TILES (`mark2.md`). GObject `mode=FLOAT` is a **paint
bridge until C7**, not topology SoT. No second glossary.

### C4 — live FLOATS (ordered)

| Sub | What | Files | Status |
| --- | --- | --- | --- |
| C4.1 | Paint floats from FLOATS + host bag (ROOT park already removed in C3.6) | `tom-live.js` | **done** |
| C4.2 | One Forest membership path: TILES ↔ FLOATS via TomApi/atomics | `lib/tom/membership.js` + `forestSetWindowFloating` | **done** |
| C4.3 | `floatToggle` / `toggleFloatingMode`: Forest membership first, then `mode` bridge | `command.js`, `window.js` | **done** |
| C4.4 | Open-as-float / destroy: insert/remove under FLOATS (hook C3.5 writers) | `window.js` track/destroy + `processFloats` sync | **done** |
| C4.5 | Mark 2 / DnD: refuse TILES ops on FLOATS focus; GRAB flags unchanged | `forest-run.js`, `drag-drop.js` | **done** (confirm) |
| C4.6 | Keep `Node.mode` ↔ FLOATS sync until C7 (optional bag `floating`) | `tree.js`, host bag | **done** |

**C4 landed (2026-08-29):** `moveWindowToFloats` / `moveWindowToTiles`;
`forestSetWindowFloating`; `paintLiveForest` paints FLOATS (detach + mode
bridge + `bag.floating`); toggle / processFloats Forest-first; open/destroy
already Forest FLOATS via C3.5. Next: **C5** reconcile + FLOAT fail-safe.

### C5 — reconcile + FLOAT fail-safe (ordered)

| Sub | What | Files | Status |
| --- | --- | --- | --- |
| C5.1 | Detect host reject (min vs slot) | `reconcile.js` `placementRejected` / `forestSlotRect` | **done** |
| C5.2 | Named adjust + retry (`share-redistribute`; tab via overflow); cap 2 | `tryAdjustShareForMins` + `reconcileWindowPlacement` | **done** |
| C5.3 | FLOAT fail-safe via C4 membership; always terminates | `floatFailSafeMembership` + `forestSetWindowFloating` | **done** |
| C5.4 | open-min / overflow `{ kind: "float" }` → Forest FLOATS | overflow/adopt/rehome + open `underFloats` | **done** |

```text
mutate TOM → paint → OK? done
  → else adjust (rules) → retry
  → else FLOATS fail-safe
```

**C5 landed (2026-08-29):** `lib/extension/reconcile.js`; hooked after
`paintLiveForest` in `runLiveForest`; mid-session overflow share→tab→Forest
float; open-min float writers use FLOATS membership (not mode-only / MONITOR
park). Next: **C6** Apply-TOM.

### C4–C5 tests (unit first)

1. Proto brake green.
2. Pure Forest: under FLOATS; Launch/Join leaves FLOATS; no POJO ROOT float kids.
3. Paint contract: no ROOT `appendChild` for FLOATS (retarget `tom-live` tests).
4. Reconcile unit: slot below min → adjust → still fail → `parentId=FLOATS`; retry cap.
5. open-min `{ kind: "float" }` → membership helper.
6. Vitest floatToggle updates Forest when live forest present.
7. Nest smoke only after units green.

Parallel with **C6** only on non-colliding Apply/epochs files (explore/09).

## C6 detail — Apply

- Desired layout document = TOM Forest (or TOM snapshot keyed by nanoid).
- GetTree remains a **Surface** dump for CLI/debug if useful — not the
  planner's model language.
- Epoch portable WINDOW key = node nanoid; Meta id in host bag.

### C6.1–C6.6 (done 2026-08-29)

| Sub | What | Status |
| --- | --- | --- |
| C6.1 | `_snapshotForestForApply` → `projectForestFromTom(wm.forest, hostBag)` | **done** |
| C6.2 | Plan/settle `windowId` = Forest nanoid; `metaWindowId` match aid; id: selectors via bag | **done** |
| C6.3 | Adapter-first: `lib/extension/forest-apply-snapshot.js` → GetTree-shaped IR | **done** |
| C6.4 | Epoch capture + session portable leaf = nanoid; `metaWindowId` for restore match | **done** |
| C6.5 | Nanoid session/H1 identity + Forest sync after GObject restore | **done** |
| C6.6 | Retire GetTree-as-planner-input call sites / comments | **done** |
| C6.7 | Brake pack beyond proto 154 + forest-apply-snapshot units | optional |

**C7.5 + C6.6:** Apply IR is always `ensureLiveForest` then
`projectForestFromTom`. No GObject `projectForest` planner path.
GetTree DBus unchanged (Surface). Restore/H1 Forest-first (**C7.7**).
`forestForWrite` no longer rebuilds from GObject (C7.7).

## C7 detail — delete dual topology

- Stop using GObject Node child lists as tiling truth.
- Retarget `findNode(Meta)` → host bag reverse index or
  `metaId → nanoid` map.
- Delete or gut `tree.move` / leftover topology mutators once callers
  are OpSet/Forest.
- Tests: CommandHandler / drag-drop / structure / nest invoke against
  Forest.

| Sub | What | Status |
| --- | --- | --- |
| C7.1 | Finder shim: `idFromMeta` → `liveById` / walk if unseeded | **done** |
| C7.2 | RunSteps `_moveOp`/bind/order → Forest atomics + paint | **done** |
| C7.3 | Apply structure + open/track writers | **done** |
| C7.4 | DnD SurfaceOps → Forest | **done** |
| C7.5 | Drop `syncForestFromTree` before Apply snapshot | **done** |
| C7.6 | Gut `tree.move` / `swapPairs` / Meta walk once callers gone | **done** |
| C7.7 | Forest-first restore/H1 | **done** |

## Brake / verify

1. `cd prototypes/container-motion && npm test` (kernel)
2. Vitest slices touching tom / command / drag-drop / epochs as retargeted
3. Nest Mark 2 smoke (`nest_invoke` / nest_mark2_smoke) after C3+
4. Full repo test when C7 nears done

## Session notes

**C6.6 (2026-08-29):** Retire GetTree-as-planner-input. Apply snapshot
never feeds GObject `projectForest` into planReconcile. Cold
`!_liveForestSeeded` → `ensureLiveForest` → `projectForestFromTom`.
If seed fails, empty TOM IR (`via=empty`), not Surface GObject dump.
DBus `GetTree` still `tree-query.projectForest` (CLI/debug). Comments
in tree-query / layout-apply-* / layout-open / layers / P5 no longer
claim GetTree is Apply IR.

- `_snapshotForestForApply`: seed then TOM only
- Remaining `projectForest(` in `lib/`: GetTree DBus + tree-query tests
- Brake: proto **154**; forest-apply-snapshot 7; session-api-layout-cycle
  35 (1 new cold-seed case)
- Cutover acceptance: met aside from “Host facts only via bag” Meta
  residue on some topology nodes
- Did **not** archive the plan; next is polish / nest smoke / archive
  readiness. C6.7 optional extra brake pack.

**Next:** cutover polish / nest smoke / archive readiness.

**Polish (2026-08-29, live tip AncHA):** Host `black` Wayland. Vinyl ok;
`layout dev` aborted `duplicate mon-direct for size targets` (GObject
`_sizeOp`). **Peeled:** `forestSizeWindows` (skip dups like order; no
apply abort). **Metrics:** `lib/extension/metrics.js` — grep `metric `.
**Hunt flags:** `HUNT_TILE_SLOT_FLOAT=false`. **Still GObject-ahead:**
close/`auto-exit-tabbed` (singleton TABBED after vinyl Inkscape); id-miss
DnD/RunSteps fallbacks; unseeded T6; Meta on some nodes. **Hunt only
via `forge log`.**

**C7.7 (2026-08-29):** Forest-first session restore / H1. Last required
C7 slice. Did **not** start C6.6 GetTree planner. Did **not** delete
Host `tree.move` / `swapPairs` / unseeded GObject restore.

- Adapter: `lib/extension/forest-restore.js` —
  `captureForestFromTom` / `rehomeWmForestWindows` /
  `restoreWmForestStrict` / `restoreWmForestIfNeeded` /
  `forestCollectMonLoss` + `paintWmForest`
- Session: `rehomeWindowsForSessionForest` Meta move (host) + Forest
  reparent; `restoreSessionForestStrict` Forest apply (strict
  resolve). Seeded path **does not** `syncForestFromTree`
- H1: `snapshotTree` / `restoreTreeIfNeeded` Forest when seeded;
  retile Meta-align from Forest; mon-loss Forest collect; no
  post-settle sync
- `forestForWrite`: `ensureLiveForest` + FLOAT-mode TILES align only
  (dropped GObject rebuild). Id-miss GObject fallbacks still
  `_syncForestIfSeeded` on `tree.move` / `swapPairs`
- `repairSharesAfterChildChange` skips non-CON (MONITOR.layout is
  child-CON hint, not a sibling split) — workspace-insert percents
- Unseeded restore still GObject T6 (`lib/epochs/restore.js`)
- Brake: proto **154**; forest-restore 3; session-layout 40; H1 22;
  forest-apply 7; tom-live 37; session-api-layout-cycle 34;
  workspace-insert-flatten 3 (was pre-existing fail)
- No DESIGN-FLAW

**Next:** optional C6.6 GetTree planner / cutover acceptance polish /
nest smoke. C7 umbrella **done** pending those leftovers.

**C7.6 (2026-08-29):** Gut live GObject topology authority of
`tree.move` / `swapPairs`. Product swap is Forest-first. Did **not**
Forest-first restore/H1 (C7.7). Did **not** delete Host `swapPairs` /
`move` bodies (tests + id-miss fallback; restore/H1 still GObject-ahead).

- `WindowSwapLastActive` → `forestSwapWindows` then `paintWmForest`;
  GObject `swapPairs` only if Forest ids miss
- `tree.swapPairs`: Forest-first when seeded; GObject body +
  `_syncForestIfSeeded` as fallback
- `tree.move`: leftover Host/helper (no live `lib/` caller); GObject
  body kept; `_syncForestIfSeeded` after a successful write
- DnD `_findNodeWindowAtPointer`: `tree.findNode` (bag-first) not
  raw `getNodeByValue`
- DnD / RunSteps `_swapOp` already Forest-first; GObject fallback kept
- Did not rewrite `restoreSessionForestStrict` / H1 `restoreTreeIfNeeded`

- Brake: proto **154**; CommandHandler **80** (1 new Forest-first
  swap case); tom-live 37; drag-drop 37; tree-operations 70;
  drop-intent 53; j9fo 1; structure 6
- Pre-existing (not this slice): H1 workareas-thrash + workspace
  insert-flatten — GObject-ahead recover; **C7.7**

**Next:** **C7.7** Forest-first restore/H1. Optional C6.6 GetTree
planner. No DESIGN-FLAW.

**C7.5 (2026-08-29):** Apply snapshot no longer `syncForestFromTree`
when seeded. `_snapshotForestForApply` uses `wm.forest` + bag via
`projectForestFromTom`. Cold `!_liveForestSeeded` still
`ensureLiveForest` (then TOM IR) else `projectForest`. Did **not**
gut `tree.move` / `swapPairs` (C7.6 — **done**). Did **not** Forest-first
restore/H1 (C7.7).

`forestForWrite` still `syncForestFromTree` then
`alignForestFloatsToLiveTiles` — writer align/fallback while GObject
fallbacks and restore/H1 remain ahead. **Not** used for Apply IR.

Admit-before-plan (`admitUntrackedWindows` → `trackWindow` →
`forestInsertWindow`) already writes Forest, so dropping Apply sync
does not miss untracked maps.

- Brake: proto **154**; forest-apply 7; session-api-layout-cycle 34
  (2 new Forest-authority cases); structure 9; tom-live 37;
  drag-drop 37; drop-intent 53; tab-strip 73; CommandHandler 79;
  session-layout 40
- Pre-existing (not this slice): H1 workareas-thrash 4 + workspace
  insert-flatten 1 — GObject-ahead recover; **C7.7**

**Next (at C7.5 ship):** C7.6 gut `tree.move` / `swapPairs` — **done**.

**C7.4 (2026-08-29):** DnD SurfaceOps Forest-first then `paintWmForest`.
Did **not** drop Apply `syncForestFromTree` (restore/H1 still
GObject-ahead); did **not** gut `tree.move` / `swapPairs` (command
`WindowSwapLastActive` still calls). Mark 2 Join/Move path kept.

Peeled: `_commitDropSurface` (`swapPairs` / `group` / `wrap` /
`slotSplit` / `split` / `insert`), `swapWindowsUnderPointer`,
empty-mon attach, foreign-strip join, origin/tab-strip reorder.
Tab deco / `_finishDropMutate` chrome stay host. Stack→tab uses
`forestSetLayout` when ids exist.

Deferred at C7.4 ship: sync-before-snapshot (C7.5, **done**); restore/H1
(C7.7); gut `tree.move` / `swapPairs` (C7.6).

- Adapter: `forestMergeWindowsIntoGroup` / `forestWrapInsert` /
  `forestSlotSplit` / `forestSplit` / `forestOrderLiveChildren` +
  existing `forestSwapWindows` / `forestReparent` / `forestSetLayout`
- `forestForWrite` treats GRAB_TILE as TILES (DnD spine)
- Same-parent `Node.appendChild` / `insertBefore` skip tab chrome
  teardown (paint reorder of a TABBED CON sibling)
- GObject fallback kept if Forest ids miss
- Brake: proto **154**; tom-live 37; WM drag-drop 37 + comprehensive
  65; drop-intent 53; tab-strip 73; CommandHandler 79; R015 10

**Next (at C7.4 ship):** C7.5 drop sync-before-snapshot — **done**.

**C7.3 (2026-08-29):** Apply structure + open/track Forest-first then
`paintWmForest`. Did **not** peel DnD SurfaceOps; did **not** drop Apply
`syncForestFromTree` (DnD/restore still GObject-ahead); did **not** gut
`tree.move` / `swapPairs`.

Peeled: `_layoutOp`, `_setLayoutStructureOp`, `_skeletonOp` (CON/PH
invent Forest + live PH bind), `window.js` wrap/split/rehome/place-hint
insert. `forestInsertWindow` parents under live CON when Forest has it.
Open-min float stays FLOATS.

Deferred at C7.3 ship: `dnd-drop` / `place-next` / focus/close /
merge-group / ungroup / size / restore/H1. Size peeled later
(`forestSizeWindows`). `layout-cycle` uses `forestSetLayout` with
GObject fallback.

- Tom: `inventConUnder` / `inventWindowUnder`
- Adapter: `forestSetLayout` / `forestLiftToMonitor` / `forestWrapNode`
  / `forestWrapForTabStack` / `forestApplyLayoutStructure` /
  `forestApplySkeletonMon` / `paintWmForest`
- Interim: `forestForWrite` still syncs (C7.6/C7.7); `alignForestFloatsToLiveTiles`
  pulls FLOAT-mode WINDOWs that are still live-parented under TILES
  (LayoutBatch unhide) so paint does not detach siblings
- GObject fallback kept if Forest ids miss (layout wrap/lift, skeleton
  invent, open wrap/reparent)
- Brake: proto **154**; tom-live 32; session-api-layout-cycle 32;
  TZ-tab-apply 5; CommandHandler 79; WM lifecycle 32; open-app-policy 47

**Next:** **C7.4** DnD SurfaceOps → Forest. Then C7.5 drop
sync-before-snapshot. Restore/H1 last. No DESIGN-FLAW.

**C7.2 (2026-08-29):** RunSteps writers Forest-first then
`paintWmForest`. Did **not** peel layout/skeleton/open/DnD; did **not**
drop Apply `syncForestFromTree` (then skeleton/open/layout GObject-ahead);
did **not** gut `tree.move` / `swapPairs` (DnD/command still call).

Peeled: `_moveOp`, `_bindOp`, `_orderMonChildrenOp`, `_swapOp`,
`_moveInOp`, `_moveOutOp`.

Deferred: `layout` / `layout-cycle` / `merge-group` / `group` /
`ungroup` / `skeleton` / `size` / `dnd-drop` / `place-next` /
focus/close.

- Tom: `layoutUnit` / `monDirectAncestor` / `siblingCon` /
  `unwrapUnarySplit`
- Adapter: `forestReparent` / `forestBindWindow` /
  `forestOrderWindows` / `forestSwapWindows` / `forestMoveIn` /
  `forestMoveOut` / `paintWmForest` (`tom-live.js`)
- Interim: `alignForestToLiveConParent` when GObject-ahead layout
  parks FLOAT-mode WINDOW under a TILES CON
- GObject fallback kept if Forest ids miss
- Brake: proto **154**; tom-live 26; session-api-layout-cycle 31;
  move-in/out 12; TZ-tab-apply 5; CommandHandler 79; forest-apply 7

**Next (at C7.2 ship):** C7.3 layout/skeleton/open — **done** (see C7.3
note).

**C7.1 (2026-08-29):** Finder shim. Meta→node via
`liveWindowFromMeta` (`hostBag.idFromMeta` → `liveById`).
`findNodeWindow` + `Tree.findNode(object)` bag-first; string spine
ids (`wsN` / `mo*`) still `getNodeByValue`. Unseeded / bag miss
walks. Did **not** peel RunSteps / open / DnD / restore; did **not**
drop `syncForestFromTree` or gut `tree.move`.

- Helper: `lib/extension/tom-live.js` `liveWindowFromMeta`
- WM: `findNodeWindow` bag then `tree.findNode`
- Hot Meta lookups in `window.js` / `command.js` / `drag-drop.js` →
  `findNodeWindow`; dest mon ids stay `tree.findNode(destId)`
- Brake: proto **154**; layout/lifecycle/drag-drop/command/tree/
  tom-live/bag vitest green

**C6.5 (2026-08-29):** Nanoid session identity + post-restore Forest
sync. Did **not** rewrite rehome / strict restore / H1
`restoreTreeIfNeeded` to Forest-first (C7).

- `saveSessionLayoutForReload`: `focusWindowId` =
  `portableWindowKeys(focusMeta, hostBag).windowId` (nanoid when bag
  seeded), not `windowStableId(Meta)`.
- `restoreSessionLayoutAfterTrack`: after GObject rehome+strict,
  `syncForestFromTree(wm)`.
- `createWindowResolver` / `fromLeafAssignBySavedId`: synthetic
  focus/LTF `{ id }` matches portable nanoid **or** `metaWindowId`.
- H1 already `snapshotTree()` + post-settle `syncForestFromTree`;
  comments only.
- C6.6 not started: GetTree DBus still Surface; cold
  `!_liveForestSeeded` planner fallback remains. No new
  GObject-planner call sites.
- Brake: proto **154**; session-layout 40; H1 22; forest-apply /
  tom-live / reconcile green.

**C7 leftovers (Host/helper, not dual-run):** `tree.move` /
`swapPairs` bodies + id-miss GObject fallbacks; unseeded T6
`restoreForestIfNeeded`; `Node.mode` FLOATS paint bridge. GetTree
DBus remains Surface (C6.6 done — not planner input). Finders
bag-first (C7.1). RunSteps / layout / open / DnD / Apply snapshot /
restore/H1 Forest-first. No DESIGN-FLAW.

- Operator: big bang; kept WM name, monitor-resolve split, D023 paint.
- Do not reopen hybrid dual-run. Do not start pinned-slots.
