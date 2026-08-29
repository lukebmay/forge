# Mark 2 OpSet

**Status:** prototype lock (not Shell yet)
**Code:** `lib/opsets/mark2.js` (proto `src/opsets/mark2.mjs` re-exports)
**Tests:** `test/cases-mark2.mjs`, `test/cases-workflows.mjs`
**Updated:** 2026-08-28

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

**Settle:** prune empty CONs, unary-collapse 1-child CONs, then repair
same-type CON nesting. Repeat until stable. Mark 2 settle also wraps an
n-child MONITOR into one CON (that MONITOR’s layout, else HSPLIT).
TreeOp `Delete` does not settle; Mark 2 `Remove` does.

---

## Invariants (after Mark 2 settle)

1. Each MONITOR has 0 or 1 child.
2. A CON is never empty and never has exactly one child (unary collapse).
3. A CON is never nested in a CON of the same layout. Same-type H/H or V/V
   becomes TABBED. Do not flip H↔V to “fix” that — flipping undoes invent.
4. v1 Move and Join act on a **WINDOW leaf**. Launch uses the selected
   WINDOW or CON as the slot; after Launch, focus is the new WINDOW.
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

## SurfaceOps

v1 Move/Join act on a WINDOW leaf. Launch inserts a WINDOW next to the
selected WINDOW or CON.

### Move(dir)

Does not invent structure.

1. In-axis neighbor → swap.
2. In-axis edge, parent has ≥2 children, `edgeMove=wrap` → rotate the leaf
   to the other end (`H(A,B,C)` A← → `H(B,C,A)`).
3. Else if the leaf is at the MONITOR edge in `dir` (every ancestor step is
   in-axis first/last) → transfer to the neighbor MONITOR.
4. Else breakout/promote in `dir`, then settle.

Wrap beats cross-monitor: `H(A,B)|H(C,D)` B→ stays on mon1 as `H(B,A)`.

### Join(dir)

Invent or enter structure toward `dir`.

1. MONITOR edge + neighbor MONITOR → transfer as join.
2. Parent has exactly two WINDOW children **and** breakout is illegal →
   wrap those two, any dir (this is the MONITOR’s sole child CON).
3. In-axis sibling WINDOW → wrap the pair.
4. In-axis sibling CON, CON is in-axis for `dir` → **enter** that CON at
   the near edge (arrive from the right → append; from the left → prepend).
5. In-axis sibling CON, CON is cross-axis for `dir` → flatten that CON’s
   children into the parent container and insert the leaf at the boundary
   (promote-join).
6. Otherwise breakout/promote in `dir`, settle, then Join again against the
   new sibling in `dir`.

Worked:

```text
Given:   Mon1(H(TAB(A,B),TAB(C,D)))
Join(C, left)
Expect:  Mon1(H(TAB(A,B,C),D))
```

C has no left sibling in its TAB, so it breakouts onto the HSPLIT, unary
collapse leaves D, then C enters TAB(A,B) at the near (right) edge.

```text
Given:   Mon1(H(V(A,B),V(C,D)))
Join(C, left)
Expect:  Mon1(H(A,B,C,D))
```

Breakout then flatten the cross-axis V on the left — not wrap-pair
`TAB(C,D)`.

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
put a floater below 10% of that split, or would make a wrap child
shorter than 10% of the MONITOR on the wrap's in-axis, do **not**
split. Instead add a **TABBED** as next sibling, move the selected slot
into it, and add the new WINDOW as a sibling in that TAB. TABBED /
STACKED inserts never hit this floor (peers share one pane).

The wrap CON inherits the selected slot's in-axis share and
`userSized` flag. The new WINDOW is a floater. After Launch, settle and
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

## Prefs

Session bag (`lib/session/`), not Forest fields.

| Pref | Default | Effect |
| --- | --- | --- |
| `edgeMove` | wrap | in-axis edge: wrap, noop, or pop |
| `defaultJoinContainer` | SPLIT | TAB forces invented wraps to TABBED |
| `aspectTieBreak` | HSPLIT | square invent |
| policy enabled | on | off → TreeOps only |

Stale Mark 1 `edgeMove=noop` migrates once to wrap.
