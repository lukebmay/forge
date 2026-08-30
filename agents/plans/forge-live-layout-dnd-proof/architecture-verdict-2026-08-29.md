# Architecture verdict — live layout / DnD proof (2026-08-29)

**Plan:** [forge-live-layout-dnd-proof.md](../forge-live-layout-dnd-proof.md)
**Locks:** D092 live POJO Forest · D093 present → observe → AGREE or
RESYNC (TOM toward REALITY; FLOAT terminator)
**Sessions:** `jSEYa` (forest-match / empty-mon) · `ScLRi` (enable
float-mismatch + `layout dev` St dispose crash)
**Verdict date:** 2026-08-29
**Author:** architecture review (read-only; no product JS)

## One-line

D093 is still the path. The desk is failing because the **Gnome
presenter still has a second child-list** (GObject `Node` walk +
`bag.floating` + `Node.mode`) and maps that leftover onto D093
REALITY. That is unfinished C7 **present/observe/chrome**, not a
kernel redesign and not a stack of `parentNode` guards.

## Answers to the four questions

### 1. FLOAT terminator vs pre-tile FLOAT mode

**Incomplete adapter observe contract**, not a kernel design flaw.

D093 FLOAT terminator means: host **cannot honor TILES** (mins
fail-safe) or the window is **host-unmanaged**. It does **not** mean
`WINDOW_MODES.FLOAT` before `processFloats`, GObject `parentNode ===
null`, or a stale `bag.floating` bit.

S1 units covered:

- `bag.floating === false` wins over live FLOAT mode (even
  `parentNode: null`)
- bag-miss + live parent is CON/MONITOR → omit `fact.floating`

S1 did **not** cover the live enable path that still fires
`metric drift kind=float-mismatch reason=entered-monitor`:

- bag-miss (or `floating` unset) + **`parentNode` not CON/MONITOR**
  (null, WORKSPACE, ROOT, already detached) + `isFloat()` true
  because every new node is FLOAT until `processFloats`
- **`bag.floating === true` while Forest is TILES** after
  `alignForestFloatsToLiveTiles` / `alignForestToLiveConParent`
  appends a FLOATS WINDOW back under a live CON **without clearing
  the bag bit** (`tom-live.js`). Observe then prefers bag → resync
  `moveWindowToFloats` → paint detaches → render throws

That is a **three-vote membership** (Forest parent, `bag.floating`,
GObject parent/mode). D092 already named Forest parent as SoT
(`parentId === FLOATS`). Observe must not let the other two votes
drive the terminator.

REALITY floating is **Meta unmanaged after a float decision** (user
float, exempt, C5 fail-safe) — never `Node.mode`, never “detached
GObject node.”

### 2. Dual GObject Tree + Forest during cutover

**Yes — unfinished C7 presenter, not more guards.**

C7.1–C7.7 made **writers** Forest-first. Cutover notes still call
leftovers “Host/helper, not dual-run” (`tree.move` / id-miss /
unseeded T6 / `Node.mode` bridge). Live proof shows a **presenter
dual-run**:

| Path | Still GObject topology |
| --- | --- |
| `paintLiveForest` | `replaceChildren` / `removeChild` on `Node` |
| FLOATS paint | **nulls `parentNode`** then mode-bridge |
| `tree.render` / `processNode` | walks `childNodes` as TILES |
| `processTabbed` / `_ensureConTab` | CON-under-TABBED chrome |
| `updateDecorationLayout` | `getNodeByType(CON)` |
| `showWindowBorders` | `parentNode.isStackedOrTabbed()` (no null) |
| `resyncWmAndPaint` then `renderTree` | paint mutates GObject, render assumes it |

D092: GObject is **not** the document; actors/chrome keyed by id.
Nulling `parentNode` on FLOATS while `tree.render` + decoration
still require a parent **is** dual-run. `if (!parentNode) return`
stops one throw and leaves the next (H2 extras, St dispose,
empty-mon `findAncestorMonitor` miss).

The architectural cut is: **one present**. Forest membership →
hostBag actors. GObject `childNodes` may mirror TILES chrome; it
must not be the walk that decides FLOAT vs TILE, TABBED kids, or
which CON still owns an St strip.

Forbidden still: twin child-list atomics (`AtomicsGnome`). Do not
“fix” this by making GObject topology again.

### 3. Tab chrome vs ApplyLayout thrash

**Yes — St chrome is still a GObject-tree walk. Forest writer SoT
does not stop the crash.**

Chrome lifecycle today:

- `Node._createDecoration` allocates `St.BoxLayout`, stores it on
  the CON (`con.decoration`), even sets `decoration.parentNode =
  this` (GObject Node leaked onto the actor)
- `processTabbed` / `_ensureConTab` attach **per GObject child**,
  including CON children (Bug #57 nested-split tab — H2 says that
  shape is a writer/paint bug)
- `updateDecorationLayout` hides **every** CON deco then
  re-shows/restacks eligible strips; `attachTabDecoration`
  `remove_child` + `layer.add_child` **rethrows** after warn
- ApplyLayout: `forestApplySkeletonMon` **destroyNode**s occupied
  CONs, `paintWmForest` invents new live CONs (`new St.Bin()`),
  `tree.render` rebuilds strips, then `renderTree` ~2729
  `updateDecorationLayout`

`ScLRi` journal `Object St.BoxLayout … already disposed` in
`attachTabDecoration` / `updateDecorationLayout` /
`window.js` `renderTree` is that churn: a CON identity dies in
Forest, paint/orphan sweep disposes the actor, a leftover GObject
CON still holds `decoration`, restack touches the corpse. Session
logout + `disable-user-extensions` is the host dying, not a log
quirk.

Guarding dispose is necessary **hygiene** (never rethrow into
render). It is not the architecture. Chrome must be keyed by
**Forest CON nanoid** in hostBag; restack walks Forest
TABBED/STACKED only; leftover GObject CONs do not own live St.

`_ensureConTab` stays dead once TABBED/STACKED children are WINDOW
only (H2). Until writers/paint guarantee that, ApplyLayout will
keep building nested CON tabs and `forest-match` will fail
`mon0`/`mon1` even when slot machines report hard-done (`jSEYa`).

### 4. Redesign meeting vs keep D093

**Keep D093. No redesign meeting. No hard blocker.**

D093 already says: if AGREE/RESYNC cannot keep host honest →
meeting, **do not add a second tiling tree**. Live failure is the
adapter lying about REALITY and presenting through a leftover
tree — the failure class D092/D093 named. Opening a meeting now
would rediscover those locks.

Hard-block only if the next slice proposes twin atomics, hybrid
project→mutate→apply-back, or “GObject child-list is topology
again.” That is not this verdict.

Cost of finishing presenter C7 (`tree.processNode` + decoration)
is large but **in-contract**. Do it as ranked cuts below, not a
new design novel. Pinned-slots / resize-autotile stay parked.

## (a) Must-fix architectural items (ranked)

1. **Observe REALITY floating from host-unmanaged, not leftover
   votes.** `observeFloating` must not use `Node.mode` /
   `isFloat()` / `parentNode == null` as FLOAT. Prefer: Forest
   membership is the TOM side; REALITY is Meta unmanaged **after**
   `processFloats` / user-float / exempt / C5. If bag and Forest
   disagree, Forest wins and the bag is repaired — bag is a
   bridge, not a vote. `alignForestToLiveConParent` must not pull
   FLOATS → TILES without `bag.floating = false` (or must not
   exist once observe stops using GObject parent as truth).
2. **One present: stop treating GObject `childNodes` as TILES
   membership.** FLOATS paint must not be the reason
   `tree.render` / `showWindowBorders` throw. Either (preferred)
   render/decoration walk Forest + `liveById`, or FLOATS windows
   stay off the TILES walk **by id** without requiring
   `parentNode`. `resyncWmAndPaint` + `renderTree` on the same
   entered-monitor must not paint-detach then walk the corpse.
   Swallowing paint errors (`catch` in `resyncWmAndPaint`) then
   throwing in `renderTree` is the same race.
3. **Tab chrome keyed by Forest CON id.**
   `updateDecorationLayout` iterates Forest TABBED/STACKED via
   `liveById` / hostBag actors, not `tree.getNodeByType(CON)`.
   `attachTabDecoration` never rethrows dispose; disposed actor →
   drop ref, untrack, skip (recreate next present). Skeleton CON
   destroy must destroy chrome **by that id** before inventing a
   new CON.
4. **TABBED/STACKED children are WINDOW only (H2/H3 as writer
   invariants, not paint extras).** Occupied skeleton must
   lift/replace, not stack PH beside live CONs. Paint must not
   `replaceChildren([...want, ...extras])` under a bag. Nested
   CON under TABBED is a **metric invariant**, not “i3 nested tab.”
5. **Apply present is one epoch present, not N GObject
   rebuilds.** Slot-machine hard-done + `forest-match` fail on
   monitor keys means snapshot IR vs painted GObject extras.
   After (1)–(4), S4 is hunt `compareLayoutStructure` vs
   `projectForestFromTom` — not a new match heuristic.

H4/H5 (empty-mon TRACE, TABBED bag slot) stay **after** (1)–(3).
S5 units already landed; do not expand DnD until FLOATS detach
stops nulling source-mon ancestors.

## (b) Safe local fixes (not duct tape)

These complete the D093 adapter contract. They are not
`try/catch` around the same lie.

- **Observe:** bag-miss + Forest TILES → omit `fact.floating`
  regardless of `parentNode` / `isFloat()`. Unit that inverts:
  TILES WINDOW, bag miss, `parentNode: null`, `mode: FLOAT` → no
  `moveWindowToFloats`.
- **`showWindowBorders` / any `parentNode.isStackedOrTabbed()`:**
  FLOATS (or detached) is a legal presenter state — branch on
  Forest membership / `bag.floating`, not GObject parent. This is
  FLOATS paint, not a crash guard.
- **`attachTabDecoration`:** dispose → untrack, `con.decoration =
  null`, return; do not `throw e` into `renderTree`.
- **`resyncWmAndPaint`:** if paint throws, `recordInvariant` and
  **do not** continue to `tree.render` on a half-detached GObject
  list.
- **`alignForestToLiveConParent`:** if it rehomes FLOATS → TILES,
  set `bag.floating = false` in the same turn (or delete the
  align once observe ignores GObject parent).
- **H2 scan:** after present, if a TABBED/STACKED live CON has a
  CON child, `recordInvariant("tab-con-child")` — that is the
  forest-match class.

Not in this list: blanket `if (!parentNode) return` on every
walker; extra `processFloats` delays; dual-run `syncForestFromTree`
to “heal” paint.

## (c) Hard blocker / redesign meeting

| Ask | Decision |
| --- | --- |
| Redesign meeting (TOM / D093 / twin trees) | **No** |
| Hard human blocker | **No** — implementer can proceed from this verdict |
| Archive agree-resync / cutover | **No** until host `dev` eyes-on + no `render-throw` |
| Revive hybrid dual-run | **Forbidden** (D092) |

Optional later: a **presenter C7** slice on the live-layout plan
(chrome + `processNode` keyed by Forest). That is translation of
D092 leftover, not a new lock.

## (d) Hunt tokens (`forge log --grep`)

Existing (keep): `metric agree` · `metric drift` · `metric resync`
· `metric fallback` · `metric invariant render-throw` ·
`forest-match` · `dnd empty-mon` · `entered-monitor`.

Add (WARN/INFO, greppable strings; TRACE fields OK under `--dev`):

| Token | When | Fields |
| --- | --- | --- |
| `metric drift` | already; **extend** | `kind` `id` `reason` plus `expected` `actual` `forestParent` `bagFloating` `liveMode` `parentKind` `metaMon` |
| `observe float-unknown` | omitted `fact.floating` | `id` `parentKind` `bag` `mode` |
| `observe float-host` | REALITY unmanaged | `id` `why=` (`exempt`/`user`/`mins`) |
| `resync pingpong` | same id FLOATS↔TILES twice in one resync | `id` `steps` |
| `align-floats-to-tiles` | `alignForestFloatsToLiveTiles` pulls off FLOATS | `id` `destParent` |
| `paint detach` | FLOATS `removeChild` | `id` `hadParent` `parentKind` |
| `metric invariant parent-null` | TILES WINDOW live `parentNode` null at render | `id` `from=` |
| `metric invariant tab-con-child` | TABBED/STACKED has CON child after paint | `id` `childId` |
| `metric invariant deco-disposed` | St actor finalized in attach/restack | `conId` `from=` |
| `deco restack` | TRACE: CON count walked vs Forest TABBED/STACKED count | `gobjectCons` `forestBags` |

Hunt recipe after next nest/host:

```text
forge log --session <id> --grep 'metric drift|render-throw|parent-null|tab-con-child|deco-disposed|resync pingpong|paint detach|forest-match|dnd empty-mon'
```

Do not `read_file` the hunt tapes.

## What this is not

- Not “FLOAT terminator was wrong.”
- Not “need AtomicsGnome lockstep.”
- Not “S1–S3 units failed to compile” — they failed to **cover
  live enable + bag/GObject disagreement + chrome dispose**.
- Nest `_forge-test-ghosttys` occupied dest can be green while
  host `layout dev` (Chrome TABBED, occupied skeleton, deco
  thrash) still dies. Nest is the reload gate, not host-chrome
  sign-off.

## Next coding path

Stay on [forge-live-layout-dnd-proof.md](../forge-live-layout-dnd-proof.md).
Order: observe contract (H1 complete) → present/chrome (this
verdict items 2–3) → H2/H3 invariants live → S4 forest-match →
H4/H5 only if source-mon still dies. Proto brake 154. No commit
unless asked.
