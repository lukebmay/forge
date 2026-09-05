# Mark 2 OpSet

**Status:** product OpSet (D080). Shell via ForgeAdapterGnome; proto via
ForgeAdapterWebView. Not a prototype-only experiment.
**Code:** `lib/opsets/mark2.js` (proto `src/opsets/mark2.mjs` re-exports)
**Tests:** `test/cases-mark2.mjs`, `test/cases-workflows.mjs`
**Updated:** 2026-09-04

This file is the source of truth for Mark 2. Implementation lives at
`lib/opsets/`. Changing a rule here **requires the same effort** to
update `lib/opsets/mark2.js`, tests, and any shorthand/UI that exposes
the op. If code and this file disagree, this file wins until you
change it on purpose.

---

## TOM shape Mark 2 assumes

Mark 2 mutates **TILES** only (D087). The forest document is
`META + FLOATS + TILES`. FLOAT windows live in FLOATS — they are not
MONITOR children. TILES is today's spine (WebView ROOT):

```text
ROOT                not a Forge container   (= TILES)
  └── WS1, WS2, …   not Forge containers (count from the OS)
        └── MONITOR   Forge container: may be empty; at most one child
              └── WINDOW  or  CON (HSPLIT | VSPLIT | TABBED | STACKED)
                    └── …
                          └── WINDOW (leaves)
```

The prototype document object is still called a forest in JS. The **tree
root node** is `ROOT` (TILES). Shorthand prints monitors only:

`Mon1(H(TAB(A,B),TAB(C,D)))` means that shape under `ROOT / WS1 / Mon1`.

MONITOR is the only spine node that is a Forge container. CON is every
other Forge container. WINDOW is a leaf.

---

## Words (one meaning each)

**Breakout** and **Promote** are the same tree operation: a node becomes a
**sibling of its parent**, inserted on one side of that parent.

```text
Before:  H(V(A,B),C)     A breakout/promote left
After:   H(A,V(B),C)     then unary collapse may run
```

**Unary collapse** (settle rule, not a user op): if a **CON has exactly one
child**, that child takes the CON's place in the CON's parent, and the CON
is deleted. MONITOR, WORKSPACE, and ROOT never unary-collapse.

```text
H(V(B),C)  →  H(B,C)     V had one child, so V is deleted
```

That is why breakout/promote of A from `V(A,B)` also “promotes” B: after A
leaves, V has one child, unary collapse deletes V, and B sits where V sat.

**Wrap:** give two or more nodes a new shared parent CON. Every non-leaf
Forge node is a container; wrapping is “insert a CON between these nodes
and their current parent.”

**In-axis / cross-axis** (of a container):

| Container | In-axis | Cross-axis |
| --- | --- | --- |
| HSPLIT | left, right | up, down |
| VSPLIT | up, down | left, right |
| TABBED / STACKED | left, right | up, down |

**Parent container:** the CON (or MONITOR) that currently contains the
node. Do not say “host.”

**Ops** (this file): Mark 2’s named user operations — Move, Join, Group,
Launch, … Keyboard, pointer, commands, and run-steps resolve **only**
to these. **Host SurfaceOps** are adapter internals (`swapPairs`,
`slotSplit`, …) that Mark 2 may call; they are **not** a parallel user
path and must not be named like Mark 2 Ops (D101).

**Group** vs **Join:** Group is **tab intent** (always TAB/STACK;
never split invent; never promote-join flatten). Join invents or enters
toward `dir` and **does** promote-join flatten of cross-axis **split**
CONs.

**Size** (in-axis, D090): a **percent** or **`share`**. Percent children
take that fraction. `share` children split leftover unused space equally
with every sibling also set to `share`. Unused = 100% minus sum of
percents. Leave a split → `share` (percent does not follow). Last
`share` sibling gone → remaining percents rescale to 100%. Do **not**
say float for this — FLOAT is an unmanaged window. Code may keep
`percent` + `userSized` (`false` = share). Ids are `size.share*` (D091).

**Settle:** prune empty CONs, unary-collapse 1-child CONs, then repair
same-type CON nesting. Repeat until stable. Mark 2 settle also wraps an
n-child MONITOR into one CON (that MONITOR’s layout, else HSPLIT).
TreeOp `Delete` does not settle; Mark 2 `Remove` does.

---

## Invariants (after Mark 2 settle)

1. Each MONITOR has 0 or 1 child.
2. A CON is never empty and never has exactly one child (unary collapse).
3. A CON is never nested in a CON of the same layout. Same-type H/H or V/V
   of **window-only** children becomes TABBED. If the inner H/V has a CON
   child, unwrap it instead (TABBED/STACKED children must be WINDOW). Do
   not flip H↔V to “fix” that — flipping undoes invent.
4. v1 Move, Join, and Group act on a **WINDOW leaf**. Launch uses the
   selected WINDOW or CON as the slot; after Launch, focus is the new
   WINDOW.
5. You cannot breakout/promote a node so it becomes a sibling of MONITOR,
   WORKSPACE, or ROOT. The only way a MONITOR’s single child CON disappears
   is unary collapse when that CON is down to one child.

Atomics may temporarily violate (1)–(3). Mark 2 settle restores them.

---

## Invented wrap layout

When Join wraps nodes in a new CON, pick the new CON’s layout from the
**parent container** that will contain that wrap:

1. Prefer the **opposite split** of that parent container (under HSPLIT →
   VSPLIT; under VSPLIT → HSPLIT). Pref `defaultJoinContainer=TAB` skips to
   TABBED.
2. If a node being wrapped is already a CON with that same split, use
   TABBED instead (would otherwise nest V-in-V or H-in-H).
3. Then apply same-type repair against the parent container.

If Join emptied an HSPLIT/VSPLIT (the two windows *were* that split),
invent against that **former** split (H→V, V→H), not against the
grandparent. If Join emptied a TAB/STACK, invent against the parent
container that remains.

---

## Layers (kernel / Mark 2 / host)

| Layer | Owns | Must not own |
| --- | --- | --- |
| Kernel | Pointer event *shape* + tagged hit payload; `paneRect` math | Zone names (`center`); Mutter/DOM; grab lifecycle |
| Mark 2 | Zone/chrome policy; `pointer.hover` → descriptor; `pointer.release` → `{op,args}`; named **Ops** | St actors; `_commitDropSurface` as a user path |
| Host adapter | Grab, coords, hit query, paint preview, present/observe | Tiling policy; `resolveDropSurface` fallthrough; `Mark2Drop*` commands |

```text
Host → OpSet.pointer.hover|release(ev)
     → OpSet policy (zones/chrome)
     → OpSet.ops.group|move|join|…
```

## Ops

v1 Move/Join/Group act on a WINDOW leaf. Launch inserts a WINDOW next to
the selected WINDOW or CON. Pointer `hover`/`release` resolve onto these
same named Ops (D101). `lib/opsets/mark2.js` grows `pointer` in plan U2
— until then Gnome DnD is a stale dual path, not a second glossary.

### Move(dir)

Does not invent structure.

1. In-axis neighbor → swap.
2. In-axis edge, parent has ≥2 children, `edgeMove=wrap` → rotate the leaf
   to the other end (`H(A,B,C)` A← → `H(B,C,A)`).
3. Else if the leaf is at the MONITOR edge in `dir` (every ancestor step is
   in-axis first/last) → transfer to the neighbor MONITOR.
4. Else breakout/promote in `dir`, then settle.

Wrap beats cross-monitor: `H(A,B)|H(C,D)` B→ stays on mon1 as `H(B,A)`.

Pointer in-axis adjacent edge and same-strip reorder resolve to Move
(`args.onto` names the sibling; one hop, not repeated neighbor swaps).
Empty-monitor and cross-mon onto an empty dest resolve to Move with
`onto` = MONITOR id (`transferLeafToMonitor`; pointer may skip the
inner-edge gate keyboard Move still uses).

### Join(dir)

Invent or enter structure toward `dir`.

1. MONITOR edge + neighbor MONITOR → transfer as join.
2. Parent has exactly two WINDOW children **and** breakout is illegal →
   wrap those two, any dir (this is the MONITOR’s sole child CON).
3. In-axis sibling WINDOW → wrap the pair.
4. In-axis sibling CON, CON is in-axis for `dir` → **enter** that CON at
   the near edge (see **Enter a TAB/STACK bag — child index**).
5. In-axis sibling CON, CON is cross-axis for `dir` → flatten that CON’s
   children into the parent container and insert the leaf at the boundary
   (promote-join).
6. Otherwise breakout/promote in `dir`, settle, then Join again against the
   new sibling in `dir`.

Pointer tile-edge hits that are not in-axis adjacent Move resolve to
Join (`args.onto` = the hit WINDOW). Do not use Join for CENTER or
strip-enter — those are Group.

Pointer edge onto a WINDOW whose parent is a **sibling** TAB/STACK:
**slot-split** — flip/wrap grab with that bag on the zone axis
(LEFT/RIGHT → HSPLIT, TOP/BOTTOM → VSPLIT). Do **not** enter the bag.

Worked:

```text
Given:   Mon1(H(TAB(A,B),TAB(C,D)))
Join(C, left)
Expect:  Mon1(H(TAB(A,B,C),D))
```

C has no left sibling in its TAB, so it breakouts onto the HSPLIT, unary
collapse leaves D, then C enters TAB(A,B) at the near (right) edge.

```text
Given:   Mon1(H(TAB(A,B),TAB(D,C)))
Join(C, left)
Expect:  Mon1(H(TAB(A,B),V(C,D)))
```

C’s in-tab left sibling is D, so in-axis wrap-pair (emptied TAB under H
invents V). Not breakout-enter. Nest Given must present `TAB(C,D)` with
C first — CENTER Group appends the joiner last.

```text
Given:   Mon1(H(V(A,B),V(C,D)))
Join(C, left)
Expect:  Mon1(H(A,B,C,D))
```

Breakout then flatten the cross-axis V on the left — not wrap-pair
`TAB(C,D)`.

### Group(dir)

**Tab intent.** Keyboard optional; pointer CENTER and foreign-strip
enter. Always TAB/STACK — never split invent, never promote-join flatten
of a tab.

1. Sibling WINDOW under H/V → flip parent to TABBED when those two are the
   only children; else wrap the pair as TABBED.
2. Sibling TABBED/STACKED CON → **enter** that CON (**any** approach dir —
   U/D into a tab still enters). Child index: see table below.
3. Pointer `onto` WINDOW that is **not** a sibling (same MONITOR after
   transfer): wrap-tab **at onto's slot** (peel grab; dest pane becomes
   the bag). If onto's parent is already TABBED/STACKED, peel grab next
   to that bag and enter. Bag as the MONITOR's only child → enter the
   bag in place (cannot sibling a MONITOR).
4. Pointer `onto` a foreign TAB/STACK CON (strip): enter that bag even
   when grab is not yet a sibling (peel next to the bag; MONITOR-only
   bag → enter in place). Cross-mon: enter the dest bag **directly**
   (do not insert grab as a dest MONITOR/H sibling first).
5. Else fail closed (do **not** silently Join).

Pointer may pass `args.onto` (WINDOW or TAB/STACK CON). If `onto` is
already the in-dir sibling, run the same steps. If `onto` is on another
MONITOR, peel grab **at onto's slot** (steps 3–4). Do **not** prelude
with `transferLeafToMonitor` into dest's sole CON or as a third
MONITOR child — that reflows dest (R060). `transferLeafToMonitor` is
Move onto a MONITOR / empty dest. If `onto` is not a legal Group
target, noop — never Join, never host `mergeWindowsIntoGroup`.

### Enter a TAB/STACK bag — child index

Keyboard Join/Group and pointer Group share this table. Geometry `dir`
(grab → onto) is **not** the CENTER index.

| Gesture | Child list |
| --- | --- |
| Keyboard Join/Group `dir=left` or `up` | **append** (end) |
| Keyboard Join/Group `dir=right` or `down` | **prepend** (index 0) |
| Pointer **CENTER** (five-zone Group) | **append** (end). `place: "end"`. No `insertIndex`. Ignore grab→onto dir for index |
| Pointer **strip** `insertIndex` | insert-before that gap |

CENTER must not guess a strip gap from pointer coords. Strip is the only
`insertIndex` source.

Worked:

```text
Given:   Mon1(H(A,B))
Group(A, right)
Expect:  Mon1(TAB(A,B))
```

```text
Given:   Mon1(TAB(A,B),C) | Mon2(TAB(D,E))
Actions: Select(E); Group onto TAB(A,B)
Expect:  Mon1(TAB(A,B,E),C) | Mon2(D)
         not Mon1(H(TAB(A,B),C,E)) / wrap-all-three dest
```

```text
Given:   Mon1(H(A, TAB(B,C)))
Actions: Pointer release grab=A hit=window B center
Expect:  Mon1(TAB(B,C,A))
         not TAB(A,B,C) unless A was already first
```

```text
Given:   Mon1(H(A, TAB(B,C)))
Actions: Select(A); Join(right)
Expect:  Mon1(TAB(A,B,C))
```

```text
Given:   Mon1(H(TAB(A,B), C))
Actions: Select(C); Join(left)
Expect:  Mon1(TAB(A,B,C))
```

```text
Given:   Mon1(TAB(A,B,C))
Actions: Pointer strip grab=D insertIndex=1
Expect:  Mon1(TAB(A,D,B,C))
```

### ToggleSplit (m)

H↔V. TAB/STACK → opposite split vs the parent container, then same-type
repair.

### ToggleTabStack (n)

TAB↔STACK. H/V → TAB, then same-type repair.

### PromoteChildren (`{`)

Breakout/promote **every child** of the selected CON (they all become
siblings of that CON). Empty CON is pruned. Refused when the CON is the
MONITOR’s only child (would put several nodes on the MONITOR).

### PromoteRecursive (`}`)

Repeat PromoteChildren on deepest eligible CONs. Never dissolve the
MONITOR’s only child CON.

### Remove (Backspace)

Destroy the node, then settle. TreeOp Delete skips settle.

### Launch

Insert a new **WINDOW** leaf on a chosen MONITOR. Policy on uses these
rules; policy off uses the presenter TreeOp (append at end / wrap a
MONITOR sole window).

**Dock launch** (`Launch(MonN)` / per-monitor dock buttons): the app
lands on that MONITOR. Selected WINDOW or CON counts only if it is on
that MONITOR; otherwise append at the end of that monitor's tree.

**Guake / selected launch** (`Launch()` / key `a`): same rules on the
MONITOR that owns the current selection (or Mon1 if none).

**Selected node** is the WINDOW or CON currently selected on that
launch MONITOR (`p` parent-select counts). MONITOR / WORKSPACE / ROOT
do not count. Selection on another MONITOR does not count. If there is
no WINDOW or CON selected on the launch MONITOR, Launch **adds to the
end of that monitor's tree**.

**End of the tree:** the last leaf along the last-child walk
(`rightmostLeaf`). Insert the new WINDOW as that leaf's **next sibling**.
If that leaf is the MONITOR's sole child, wrap in place (MONITOR max-1).

**Next to a selected slot** (WINDOW or CON — the CON is treated as if
it occupied that pane):

1. Parent container is **TABBED** or **STACKED**: add the new WINDOW as
   the selected slot's next sibling.
2. Parent container is **HSPLIT**:
   - If the selected slot is **wider than tall**, add as next sibling.
   - Else add a **VSPLIT** as next sibling, move the selected slot into
     it, then add the new WINDOW as that slot's next sibling (net:
     replace the slot with `V(slot, new)`).
3. Parent container is **VSPLIT**:
   - If the selected slot is **taller than wide**, add as next sibling.
   - Else add an **HSPLIT** as next sibling, move the selected slot into
     it, then add the new WINDOW as that slot's next sibling (net:
     replace the slot with `H(slot, new)`).
4. Parent container is **MONITOR** (sole WINDOW or CON): wrap in place.
   Wider than tall → HSPLIT; taller than wide → VSPLIT; square →
   `aspectTieBreak` (default HSPLIT).

**Same-type wrap:** wrapping an H/V CON in the same split is illegal
after settle. If the slot is an H/V CON and the wrap would be that
same split: parent MONITOR → wrap the **opposite** split (or TAB if
the 10% floor hits); otherwise insert the new WINDOW as the last child
of that H/V CON (10% floor → wrap TAB around the CON).

**Square** (width === height) is neither wider-than-tall nor
taller-than-wide, so HSPLIT wraps VSPLIT and VSPLIT wraps HSPLIT.

**Size floor (10%):** if an HSPLIT/VSPLIT sibling-insert or wrap would
put a `share` child below 10% of that split, or would make a wrap child
shorter than 10% of the MONITOR on the wrap's in-axis, do **not**
split. Instead add a **TABBED** as next sibling, move the selected slot
into it, and add the new WINDOW as a sibling in that TAB. TABBED /
STACKED inserts never hit this floor (peers share one pane).

The wrap CON inherits the selected slot's in-axis share and
`userSized` flag. The new WINDOW is `share`. After Launch, settle and
focus the new WINDOW.

Default prototype geom is 1920×1080. Worked:

```text
Given:   Mon1(H(A,B))
Launch next to A
Expect:  Mon1(H(V(A,C),B))
```

A's pane is 960×1080 (taller than wide) → wrap VSPLIT.

```text
Given:   Mon1(V(A,B))
Launch next to A
Expect:  Mon1(V(H(A,C),B))
```

A's pane is 1920×540 (wider than tall) → wrap HSPLIT.

```text
Given:   Mon1(TAB(A,B))
Launch next to A
Expect:  Mon1(TAB(A,C,B))
```

```text
Given:   Mon1(H(A,B))
Launch with nothing selected on Mon1
Expect:  Mon1(H(A,B,C))
```

```text
Given:   Mon1()
Launch
Expect:  Mon1(A)
```

```text
Given:   Mon1(A)
Launch next to A
Expect:  Mon1(H(A,B))
```

Sole WINDOW on a 1920×1080 MONITOR is wider than tall → wrap HSPLIT.

```text
Given:   Mon1(H(TAB(A,B),C))
Select TAB; Launch
Expect:  Mon1(H(V(TAB(A,B),D),C))
```

TAB pane is 960×1080 (taller than wide) → wrap VSPLIT. D sits under
the tab group (bottom-left quarter).

```text
Given:   Mon1(TAB(A,B))
Select TAB; Launch
Expect:  Mon1(H(TAB(A,B),C))
```

```text
Given:   Mon1(H(A,B))
Select H; Launch
Expect:  Mon1(V(H(A,B),C))
```

Wrap H around H would same-type; MONITOR uses the opposite split.

```text
Given:   Mon1(H(V(A,B),C))
Select V; Launch
Expect:  Mon1(H(V(A,B,D),C))
```

Wrap V around V would same-type; insert as last child of V.

---

## Pointer

D101. User-facing pointer API is abstract input — **not** host commands
named after zones (`Mark2DropCenter`, …). Keyboard and pointer for the
same intent share the same named Ops. Zone geometry and drop-chrome
policy are **Mark 2 data**. Host captures grab/coords, hit-tests, paints
descriptors, presents.

### Event shape (kernel; host fills)

```text
ev = {
  world: { x, y },                    // desktop/world px
  grab:  { id, kind: "window", mins? },
  hit:   TaggedHit
}

TaggedHit =
  { tag: "window",         id, paneRect }
  { tag: "empty-monitor",  id, workArea }
  { tag: "strip",          id, axis: "x"|"y", insertIndex }
  { tag: "none" }
```

- `id` is the TOM nanoid (WINDOW, MONITOR, or TAB/STACK CON).
- `paneRect` / `workArea` are AABBs from kernel `paneRect` / world bag.
- `insertIndex` is the host chrome gap (chip geometry is paint; the gap
  is a hit fact).
- `mins` on grab are optional Meta min-size facts for refuse.
- Host **must not** put a zone name on `ev`. FLOAT / non-TILES grab →
  treat as miss (`hit.tag = "none"`).

### hover(ev) — no TOM write

Returns a chrome/preview **descriptor** only:

```text
{
  paint:   "tile-zones" | "empty-monitor" | "strip" | "none",
  zone:    "center" | "left" | "right" | "top" | "bottom" | null,
  preview: { rect, style: "tabbed" | "stacked" | "tiled" | "invalid" | "none" },
  refuse:  boolean,
  would:   { op, args } | null    // same payload release would return
}
```

Host paints `preview` (maps `style` to CSS). Host **never** executes
`would` on hover. `refuse` (mins overflow / illegal) → `style: "invalid"`.

### release(ev) — one named op or noop

Returns `{ op, args }` or `{ op: null }` (noop). Caller then runs
`ops[op](forest, api, args.dir)` with pointer `onto` when present.

```text
args = { dir: "left"|"right"|"up"|"down", onto?: nodeId, insertIndex?: number, place?: "end" }
```

Keyboard omits `onto` (target = sibling-in-dir / neighbor monitor).
Pointer `onto` is the hit WINDOW, TAB/STACK CON, or MONITOR. If the
named op fails or `hit.tag = "none"` or `refuse` → `{ op: null }`.
One release → at most one `{op,args}`. Do not invent `Mark2Drop*`.

### Five-zone tile (Mark 2 data)

On a `window` hit, zones are built from `hit.paneRect` U:

- Center C: half width/height of U, centered
  (`C.w = U.w/2`, `C.h = U.h/2`, `C.x = U.x+U.w/4`, `C.y = U.y+U.h/4`).
- Edges: trapezoids joining corresponding corners of C and U.
- Hit: outside U → not this tile; inside C → `center`; else the
  containing trapezoid (residual inside U → nearest outer edge).
- Independent of grab origin. Zone ids are Mark 2 (`center` / `left` /
  `right` / `top` / `bottom`) — never host command names.

`dnd-center-layout=SWAP` is **not** a live mapping. CENTER is always
Group.

### Zone → named op

**`window` hit** (five-zone of `onto` = that WINDOW):

| Zone | Op | `dir` | Notes |
| --- | --- | --- | --- |
| `center` | `group` | grab → onto (peel/transfer only) | Child index is **end** (`place: "end"`). No `insertIndex`. Fail closed if Group would fail. Never Join, never host merge. |
| `left` / `right` / `top` / `bottom` | `move` | zone dir | Only if grab and onto are **in-axis adjacent siblings** of the same H/V parent and the zone axis matches that split (swap / reorder). |
| `left` / `right` / `top` / `bottom` | `join` | zone dir | Every other tile edge (invent / enter / breakout-retry; includes monitor transfer as Join step 1 when `onto` is off-monitor). |

**`empty-monitor` hit:** `{ op: "move", args: { dir, onto: monitorId } }`.
`dir` = world direction from grab’s MONITOR toward the hit MONITOR.
Runs `transferLeafToMonitor` (same helper keyboard Move step 3 uses).
Pointer **may** transfer even when the leaf is not at the inner MONITOR
edge — the empty-monitor hit *is* the aim. Dest occupancy is a host
tagging fact (gap on an occupied head may still be `empty-monitor`).
Same-monitor empty hit → noop.

**`strip` hit:** `onto` = the TAB/STACK CON; `dir` from grab toward that
CON (or along `axis` from insertIndex). Pass `insertIndex` (insert-before
gap). Same CON as grab’s parent → `{ op: "move", args: { dir, onto,
insertIndex } }` (one hop). Foreign CON → `{ op: "group", args: { dir,
onto, insertIndex } }` (Group enter at that gap; off-monitor → enter
dest bag, do not dump as dest sibling).

**`none`:** hover paints nothing; release noop.

**Cross-mon `window` / `strip`:** same tables; `onto` names the dest
node. Off-monitor → the named op transfers (`transferLeafToMonitor`)
then runs its usual steps against `onto`. No host insert/wrap catalog.

**Mins:** if grab+dest would overflow slot/workarea mins, hover
`refuse: true` + `style: "invalid"`; release `{ op: null }`. OpSet
decides; host may supply `grab.mins`.

Worked:

```text
Given:   Mon1(H(A,B))
Actions: Pointer release grab=A hit=window B center
Expect:  Mon1(TAB(A,B))
```

```text
Given:   Mon1(H(TAB(B,C),A))
Actions: Pointer release grab=A hit=window B center
Expect:  Mon1(TAB(B,C,A))
```

```text
Given:   Mon1(H(A,B)) | Mon2()
Actions: Pointer release grab=A hit=empty-monitor Mon2
Expect:  Mon1(B) | Mon2(A)
```

```text
Given:   Mon1() | Mon2(H(A,B))
Actions: Pointer release grab=A hit=empty-monitor Mon1
Expect:  Mon1(A) | Mon2(B)
```

Join empty dest (keyboard, MONITOR edge) is the same transfer, not a
no-op. Keyboard Move at an in-axis H/V edge still wraps.

---

## Prefs

Session bag (`lib/session/`), not Forest fields.

| Pref | Default | Effect |
| --- | --- | --- |
| `edgeMove` | wrap | in-axis edge: wrap, noop, or pop |
| `defaultJoinContainer` | SPLIT | TAB forces invented wraps to TABBED |
| `aspectTieBreak` | HSPLIT | square invent |
| policy enabled | on | off → TreeOps only |

Stale Mark 1 `edgeMove=noop` migrates once to wrap.
