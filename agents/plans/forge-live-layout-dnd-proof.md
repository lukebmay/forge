# forge-live-layout-dnd-proof — Live layout + DnD after TOM cutover

**Status:** in progress — host `dev` + Nautilus TILE DnD **PASS**
(2026-08-29). Remaining: nest TABBED TOP/BOTTOM slotSplit (H5);
toggleTabStack nest.
**Branch:** master
**Blocker:** (none) — not a redesign meeting. Twin child-list atomics
still forbidden.
**Updated:** 2026-08-29
**Depends on:** D092 live Forest · D093 AGREE/RESYNC (cutover C7 +
agree-resync R0–R4+R6 **on the desk**)

## Goal

After reinstall + new Wayland session, **one** `forge layout <name>`
produces the desired dual-mon forest (no nested TABBED→CON chrome),
`Done.ok` / forest-match succeeds, and **DnD can move a TILE onto
another monitor** (occupied or empty). Nested Wayland is the reload
gate — unit green is not sign-off.

## Acceptance

- [x] L0 failing-then-green units (observe/paint/skeleton/slotSplit/empty-mon)
- [x] Nest `--monitors=2` layout `_forge-test-ghosttys` → forest-match
      ok; no TABBED/STACKED CON child; mon0/mon1 ghostty in-slot
      (2026-08-29 `smoke-layout-dnd` exit 0). Nautilus nest is a
      GApplication stub — `_forge-test-nest-dual` still needs a mapping
      TILE before it is the default.
- [x] Nest `dnd-drop TILE --dest-monitor 1` while dest **has** tiles
      (occupied; not L1.r015 empty-mon) — same campaign, TILE rehomed.
- [ ] Nest `dnd-drop` TOP/BOTTOM onto a TABBED **slot** does not nest
      an H/V CON inside the bag
- [x] Host `forge layout dev` after logout on **this** tip (human
      eyes-on 2026-08-29): desk good; Nautilus TILE DnD works. Do not
      resave loadouts.
- [x] Proto brake `cd prototypes/container-motion && npm test` → **154**

Do **not** treat personal `dev`/`t1` as the nest profile. Do **not**
run host `forge layout dev` from agents (desk already thrashed).

## Live evidence (host `black`, Wayland, session `jSEYa`, 2026-08-29)

Hunt: `forge log --session jSEYa` only. Apply id `al-mtesytzg-001`.

| Time | What |
| --- | --- |
| 15:57:44 | `enable` → session-layout `live windows=0` `match 0/7` **keeping flat tree** (windows not mapped yet) |
| 15:57:45 | `metric drift kind=float-mismatch` `reason=entered-monitor` (two WINDOW ids) |
| 15:57:46 | `metric invariant render-throw from=window-entered-monitor TypeError: parentNode is null` (again `window-added`) |
| 15:57:58 | `forge layout dev` snapshot `mons=2 orphans=3` |
| 15:57:58 | skeleton `n=1` then open/bind 7, order 9, size 2. Slot machines **hard-done** (`mon0.s0` TABBED, `mon0.ghostty` TILE, `mon1.s0` TABBED, `mon1.ghostty-2` TILE) |
| 15:58:05 | `forest-match failed slots=mon0,mon1` (structureMismatches at **monitor** slot keys). Soft wall timeout. `failsafe off` (dev) |
| 16:01:00 | `dnd grab MOVING` → `dnd empty-mon no-decision` (cross-mon attempt) |
| 16:04:20 | `dnd commit zone=TOP` `surface=slotSplit` `layout=TABBED stackedOrTabbed=true` |

`forge tree` after (ws0):

```text
mo0ws0 HSPLIT
  CON HSPLIT
    CON TABBED
      CON HSPLIT (Chrome Amazon, Grok)   # nested CON inside TABBED
      WINDOW Ghostty
    WINDOW Nautilus                      # later open
mo1ws0 HSPLIT
  CON TABBED
    CON VSPLIT (YouTube)                 # nested CON inside TABBED
    WINDOW Ghostty
```

Desired `dev` profile: mon0 `TABBED(chrome,Grok) | ghostty`;
mon1 `ghostty | TABBED(YT,Gmail,Voice)`. Screenshot: stacked full-width
title bars (TABBED `_ensureConTab` on CON children + CSD).

## Hypotheses (ordered; do not skip H1)

### H1 — RESYNC treats pre-tile FLOAT **mode** as REALITY floating

New WINDOW nodes start `WINDOW_MODES.FLOAT` until `processFloats`.
`trackWindow` Forest-inserts under TILES (`underFloats` false) then
`resyncWmToReality("window-map")`. Later
`updateMetaWorkspaceMonitor` → `resyncWmAndPaint("entered-monitor")`.

`observeFloating` prefers `bag.floating`, else `live.isFloat()`.
If bag miss / wipe / insert used `isFloat()`:
Forest TILES + fact.floating true → **float-mismatch** →
`moveWindowToFloats` → `paintLiveForest` **detaches** FLOATS kids
(`parentNode = null`) → `tree.render` throws.

R2 claimed this live bug fixed; tape shows it still fires on cold
enable. S1 units covered live TILES parented / bag.floating false, not
entered-monitor + **bag-miss** + FLOAT mode + **TILES Forest parent**
with `parentNode` null (observe fell through to `isFloat()`). 2026-08-29
H1 unit+patch: Forest TILES ⇒ unknown floating; adapter denies
`moveWindowToFloats` unless `bag.floating`; paint skips TILES-parented
detach without `bag.floating`.

### H2 — `paintLiveForest` extras nest leftover GObject CONs under TABBED

```js
live.replaceChildren([...want, ...extras]);
```

Unclaimed GObject CON children of a TABBED/MONITOR are appended.
TABBED then `processTabbed` + `_ensureConTab` on CON kids → nested
tab chrome. Forest-match `compareLayoutStructure` fails slot `mon0` /
`mon1` even when slot machines think inner keys are hard-done.

TABBED/STACKED children must be **WINDOW** (bag leaves). A CON child
is a writer/paint bug, not “tab of a group.”

### H3 — `forestApplySkeletonMon` stacks PH beside live windows

Occupied-mon skeleton destroys only PH / PH-only CONs, then
`forestSkeletonBuildChild` **invents** TABBED+TILE PHs under the
MONITOR. Live windows/CONs stay. Paint extras keep them. Mid-session
`layout dev` (this run: 7 reused, 0 opened) is the occupied path, not
cold-empty.

GObject fallback comment already says “empty mon children only (cold
path).” Forest path must lift/replace, not stack.

### H4 — Cross-mon DnD `empty-mon no-decision`

`_commitEmptyMonitorDrop` → `resolveEmptyMonitorDrop`. Returns null
when `sourceTreeMonIndex < 0` (`findAncestorMonitor` fails if
`parentNode` is null) **or** dest===src **or** pointer mon invalid.
Dest-with-tiles + no `nodeWinAtPointer` uses this path. Fix H1/H2
first; also fall back source mon from Meta `get_monitor()` and TRACE
the no-decision reason (`src`/`dest`/`pointer`).

Occupied dest is still a valid rehome (append / join dest mon), not
“empty only.”

### H5 — `slotSplit` / wrap inside a TABBED bag

16:04 `dnd surface=slotSplit layout=TABBED`: wrapping a tab leaf in
H/V **under** the TABBED CON. Mark 2: the **slot** is the bag. TOP/
BOTTOM on a tab group splits the TABBED CON’s parent (sibling of the
bag), not a nested split inside the bag.

## Implementation slices

| Slice | What | Files (own) | Status |
| --- | --- | --- | --- |
| **S0** | Failing oracles first | units + nest smoke (new) | L0 units landed; nest still S6 |
| **S1** | Observe/RESYNC: initial FLOAT **mode** is not host floating; bag.floating false keeps TILES; paint must not detach TILES windows | `lib/extension/observe-reality.js`, `lib/agree/index.js` if needed, `window.js` map/entered-monitor | landed (units); 2026-08-29 bag-miss/`parentNode` null gap patched |
| **S2** | Paint: TABBED/STACKED replaceChildren = Forest kids only; leftover CON → lift to MONITOR or destroy if empty; never extras-under-bag. Render must not throw on detached FLOAT | `lib/extension/tom-live.js` `paintLiveForest` | landed (units) |
| **S3** | Occupied-mon skeleton: do not stack PH beside live; lift live WINDOWs into spec slots or skip skeleton when `_monHasLayoutSkeleton` / live already present and plan bind can proceed | `tom-live.js` `forestApplySkeletonMon` | landed (units) |
| **S4** | Apply forest-match: after S1–S3, `mon0`/`mon1` structureMismatches gone on `_forge-test-nest-dual`. If still failing, hunt `compareLayoutStructure` vs `projectForestFromTom` | `layout-apply-run.js` / `layout-plan.js` only if snapshot IR is wrong | nest + host `dev` **PASS** |
| **S5** | DnD: no-decision TRACE; source mon Meta fallback; dest-with-tiles rehome; TABBED slotSplit uses bag slot | `drag-drop.js`; `forestSlotSplit`/`forestSplit` in `tom-live.js` (S2 owner if same PR) | occupied dest nest + host Nautilus **PASS**; H5 TABBED TOP/BOTTOM still open |
| **S6** | Nest campaign `--monitors=2` + dnd-drop dest-monitor; stop nest after | `scripts/forge/nest_layout_dnd_smoke.py` | **green** (`smoke-layout-dnd` + `smoke-layout-ws`) |

### S0 oracles (write before the patch)

**L0 (invert contract):**

1. `observeReality`: WINDOW under TILES, `live.mode=FLOAT`,
   `bag.floating=false` → fact.floating false; resync does **not**
   `moveWindowToFloats`.
2. Same with **no** bag entry: still must not FLOAT a TILES window
   that has a live TILE parent (map/entered-monitor). Prefer “unknown
   floating” over `isFloat()` when parent is TILES CON/MONITOR.
3. `paintLiveForest`: Forest TABBED(A,B); live TABBED also holds an
   extra HSPLIT CON → after paint, TABBED children are A,B only; CON
   is not a tab sibling.
4. `forestApplySkeletonMon` on MONITOR that already has two live
   WINDOWs: result is spec children, not spec **plus** old CONs.
5. `resolveEmptyMonitorDrop` / commit: `sourceTreeMonIndex=-1` but
   Meta monitor 0 and pointer mon 1 → dest 1, not null.
6. `forestSlotSplit` (or drop surface): unit parent TABBED → do not
   wrap a leaf inside the bag.

**Nest (S6):** `_forge-test-nest-dual` (ghostty|nautilus / ghostty).
Assert `forge tree` JSON: each TABBED/STACKED child’s `nodeType` is
WINDOW. `forge layout` ok. Then `dnd-drop` leftmost `--dest-monitor 1`.

## Do / do not

| Do | Do not |
| --- | --- |
| Failing test first; named APIs (`forest*`, `paintWmForest`, `resyncWmToReality`) | Twin AtomicsGnome; `syncForestFromTree` as the fix |
| Hunt `forge log` only (`metric drift`, `render-throw`, `forest-match`, `dnd empty-mon`) | `read_file` / `rg` on `forge.log` / `forge.jsonl` |
| Nest reload: `./install --dev` from `~/dev/me/forge` then `forge-test nested run --monitors=2` | Host `forge layout dev`; logout loops; personal profiles |
| Stop nest when campaign ends | Leave nest up; `eval` nest env in the host agent shell |
| If AGREE/RESYNC still cannot keep host honest after S1–S3 | Redesign meeting — do not add a second tiling tree |

## Context for the next agent

- **Locks:** D092 POJO Forest SoT; D093 TOM toward REALITY; FLOAT
  terminator is for **host-unmanaged**, not “node still FLOAT because
  processFloats has not run.”
- **Paint extras** (`paintKids` in `paintLiveForest` ~1101): TABBED/
  STACKED now Forest WINDOW kids only; leftover CON detach, leftover
  WINDOW → MONITOR. FLOATS detach still nulls true floats.
- **Skeleton** `forestApplySkeletonMon` (~2235) lifts occupied live
  WINDOWs into spec slots (no stack PH beside old CONs).
- **DnD empty-mon:** `drag-drop.js` `_commitEmptyMonitorDrop` +
  `resolveEmptyMonitorDrop`. TRACE currently only `dnd empty-mon
  no-decision` (no src/dest).
- **Profiles:** nest `_forge-test-nest-dual`; live matrix already has
  `L1.r012-cross-mon-tab-dnd` and `L1.r015-empty-mon-dnd` — those did
  not catch occupied-dest + nested TABBED.
- **Brake:** proto 154. **Git:** no commit/push unless asked.
- **Overlap:** S1–S3 + H1 bag-miss/`parentNode` null patch + S5 units +
  S6 nest ghosttys occupied dest **landed**. Host `dev` + Nautilus DnD
  **PASS**. Open: nest H5 TABBED TOP/BOTTOM; toggleTabStack nest.

## Session note

2026-08-29 H1 Forest-wins (verdict FIRM; nest 8NgTR / MrMZq). Stale
`bag.floating===true` against TILES Forest still drove
`moveWindowToFloats` after `align-floats-to-tiles`. Bag is a bridge, not
a vote.

**Fix**
- `observeFloating` — Forest TILES never returns `fact.floating` true
  (not from bag, mode, or `isFloat()`).
- `denyIllegalFloatPromotion` — TILES + bag/fact floating true →
  `hostBag.set({ floating: false })`, strip fact, WARN
  `metric warn float-promote-denied`. No `continue` on bag true.
- `alignForestToLiveConParent` — `hostBag.set({ floating: false })` when
  pulling FLOATS→TILES (not in-place mutate).
- `recordDrift` — float-mismatch fields `expected` `actual`
  `bagFloating` `forestParent` `liveMode`.
- `showWindowBorders` already null-safe; unit covers FLOATS
  `parentNode` null. `_normalizeSiblingPercents` uses typeof guard.

**Tests (inverted first)**
- observe: Forest TILES + bag true → repair bag, no `moveWindowToFloats`,
  WARN deny. Injected `floating:true` still denied + drift extras.
- tom-live: align live MONITOR-parented FLOATS → TILES + bag false +
  `align-floats-to-tiles`.
- DecorationManager: `showWindowBorders` with `parentNode` null does not
  throw.

**Vitest green:** observe-reality 14, tom-live 50, metrics 8,
DecorationManager 27.

**Nest** (`./install --dev` + `forge-test nested smoke-layout-ws`):
session **MrMZq**. `float-mismatch` / `render-throw` / `parentNode is
null` **gone**. `float-promote-denied` (entered-monitor) +
`align-floats-to-tiles`. Campaign **failed later** `open-miss`
ghostty-2,ghostty-3 on `_forge-test-ws-b` (not H1). Nest **stopped**.

No commit/push. No host `forge layout dev`.

**Still open**
- Nest TOP/BOTTOM onto a TABBED bag (H5)
- Nest toggleTabStack / CENTER TABBED bag

**Host eyes-on PASS (2026-08-29):** `forge layout dev` + Nautilus TILE
DnD. Do not resave loadouts.

### S6 nest campaign — **green** 2026-08-29

```bash
./scripts/forge/forge-test nested smoke-layout-dnd
# → nest layout+dnd: ok profile=_forge-test-ghosttys … dest-monitor=1 occupied
```

Default profile `_forge-test-ghosttys` (2 Ghostty TILEs). Nest Nautilus
is a GApplication name with no mapping TILE. Seed 2 Ghostty, layout,
assert no TABBED/STACKED CON child, occupied `dnd-drop --dest-monitor 1`.
Nest **stopped** after. Host desk not mutated.

### S5 — DnD empty-mon + TABBED bag slot

**Files:** `lib/extension/drag-drop.js` only (`resolveEmptyMonitorDrop`,
`sourceMonIndexFromDrop`, `_commitEmptyMonitorDrop`,
`_commitResolvedDrop` / `dropSlotSplitUnit`). Did **not** edit
`tom-live.js` (`forestSlotSplit` still called with the CON unit).

**Contract:**

1. Tree ancestor miss (`sourceTreeMonIndex < 0`) falls back to Meta
   `get_monitor()`. Pointer on another mon → `{ destMonIndex }`.
1. Occupied dest (MONITOR already has a TILE) is still a rehome when
   `nodeWinAtPointer` is null.
1. `dnd empty-mon no-decision` now includes `src` `dest`/`pointerMon`
   `hasWindowTarget` `reason=` (`src-miss` / `same-mon` / `pointer-miss`).
   Hunt token stays `dnd empty-mon`.
1. TOP on a tab WINDOW: slot unit is the TABBED CON (split vs siblings),
   not a wrap inside the bag.

**Tests (failing first, then green):**

- `tests/regression/bug-r015-empty-mon-dnd.test.js` — Meta fallback;
  occupied dest; TRACE reasons
- `tests/unit/window/WindowManager-drag-drop-comprehensive.test.js` —
  Forest-seeded TOP on tab; `_commitResolvedDrop` leaf target lifts to bag
- `tests/unit/extension/log-contract-hunt-tokens.test.js` — hunt fields

**Proven:** `npx vitest run` those three + `drop-intent.test.js` +
`WindowManager-drag-drop.test.js` → 178; plus r012/r021–r024/d4/tab-drag/
insert-slot-split → 44. Did **not** nest / host `forge layout` / proto
brake (kernel untouched).

### Session ScLRi — disposed St.BoxLayout during ApplyLayout renderTree

2026-08-29 implementer (decoration.js owner; not H1/observe-reality). Host
crash: `Object St.BoxLayout has been already disposed` at
`attachTabDecoration` `remove_child` during `updateDecorationLayout` after
`layout-apply phase=hard-ready` + slot-place (no Done/forest-match).
Apport: gnome-shell logout.

**Cause:** every CON constructs a `forge-deco` St.BoxLayout. Paint extras /
`removeChild` / orphan sweep can `destroy()` that actor while
`con.decoration` still holds the wrapper. Tabs already connected `destroy`
to null `.tab`; CON chrome did not. `attachTabDecoration` then **rethrew**
after logging, so renderTree / Gjs-CRITICAL killed Shell.

**Fix (lifecycle, not catch-and-ignore):**
- `_createDecoration` connects `destroy` → `_forgeDisposed` + null pointer
  (same pattern as window tabs)
- `_releaseDecorationActor` nulls first, then untrack/unparent/destroy
- `removeChild` tears chrome for **any** CON with a decoration (HSPLIT
  leftovers too), TABBED/STACKED still `_resetTabForReparent` first
- paint leftover CON / bag extras call `_destroyDecoration` before detach
- `attachTabDecoration` never rethrows; hide/show/restack skip disposed
- hunt: `metric warn deco-disposed`

**Tests:** `DecorationManager.test.js` disposed suite + log-contract
`metric warn deco-disposed`. Vitest: DecorationManager + log-contract +
ogmd/s7qo/auto-exit/6asv/gdsz/tab-deco/iwi/tab-click + Tree-cleanup +
tom-live + Tree-layout + WindowManager-focus + metrics + wrot/Node →
**317 green**. No commit/push. Did not re-enable host extensions. Did
not edit `observe-reality.js`.
