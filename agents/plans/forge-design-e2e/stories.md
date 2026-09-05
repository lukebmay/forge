# Design-sourced nest E2E stories

**Plan:** [forge-design-e2e.md](../forge-design-e2e.md) **T1**
**Updated:** 2026-09-03
**Spec:** `agents/design.md`, `agents/design/CHANGELOG.md` (newest row
wins), `agents/project.md` § Layout apply architecture, Mark 2
[`mark2.md`](../../../prototypes/container-motion/src/opsets/mark2.md).
Not production JS.

This catalog is the **product contract** for nest E2E. Gesture in;
observable forest / mode / identity / **visible** geometry out. Tests
change when **design** or a user-visible bug changes — never so today’s
code goes green.

Nest layouts are **`_forge-test-*` only**. Do not put personal `dev` /
`vinyl` / `t1` in this catalog. Do not name host SurfaceOps or
production helpers as oracles.

Letters `A` `B` `C` `D` are TILE windows unless marked FLOAT.
`Mon0` is the first head (nest Meta 0); `Mon1` the second. `WS1` /
`WS2` are 1-based workspaces. Landscape workarea is assumed (nest
default 1920×1080). `@share` and `50%` are D090 sizes.

---

## Tree map

Day-to-day: run the **lightest trunk** whose blast radius covers the
change. That trunk **fails** → walk **down that tree** (branch, then
leaf). Do **not** weaken the trunk. **RC** = full tree (every trunk,
branch, and leaf here), except plan-named expected-fail.

| After a change in | Lightest net |
| --- | --- |
| Free-open / Launch / insert into a split | `trunk.open.launch-into-2slot` |
| Dock dest / empty-head open | `branch.open.empty-head-dock` (2 mon) |
| Close / Remove / share repair | `trunk.close.three-equal-one-gone` |
| TABBED / STACKED / reveal / open leaf | `trunk.tabs.open-leaf-one-slot` |
| Layout apply / desired forest / extras | `trunk.layout.apply-one-ws` |
| Workspace-scoped apply | `branch.layout.ws2-no-mutate-ws1` |
| Mark 2 Join / Move / Group | `trunk.mark2.join-enter` |
| FLOAT / FLOATS bag | `trunk.float.not-under-monitor` |
| Visible settle / overlay / “desk ready” | `trunk.settle.visible-group-ready` |

**Which trunk covers what**

| Covers | Trunk id |
| --- | --- |
| open | `trunk.open.*` |
| close | `trunk.close.*` |
| tabs | `trunk.tabs.*` |
| layout | `trunk.layout.*` |
| mark2 | `trunk.mark2.*` |
| float | `trunk.float.*` |
| settle | `trunk.settle.*` |

A story **covers** one or more of: open, layout, close, tabs, mark2,
float, settle.

---

## Glossary

One word, one meaning (`documentation.md`, `mark2.md`).

| Word | Meaning |
| --- | --- |
| **percent** | TILES in-axis size: this child takes that fraction of the parent (D090). Example: `50%`. |
| **`share`** | TILES in-axis size: split leftover unused space equally with every sibling also set to `share`. Unused = 100% minus sum of percent children. All-`share` → equal split. Not FLOAT. |
| **FLOAT window** | Unmanaged window in the forest **FLOATS** bag (D087). May span heads. **Must not** sit under a MONITOR. Re-tile = place into TILES (Launch / Join). |
| **TILE** | Managed window under TILES (`ROOT` → workspace → MONITOR → CON \| WINDOW). |
| **open leaf** | The visible/active child of a TABBED/STACKED group. Peers share **one** slot. Not keyboard focus. |
| **keyboard focus** | Which window receives keys. May differ from open leaf (strip follows open leaf). |
| **slot-split** | New tiled window (or same-axis edge drop) **splits the focused (or drop-target) unit** when that unit’s H/V parent already has siblings (D032). Never a 3rd even H/V sibling. |
| **even 3-way** | `H(A,B,C)` or `V(A,B,C)` equal siblings. **Legal only after resize or reset-sizes** (D032). Free-open must not create it. |
| **Join** | Invent or enter structure toward `dir`. May flatten a cross-axis **split** CON. Not Group. |
| **Group** | Tab intent: always TAB/STACK. Never split invent. Never promote-join flatten. |
| **Move** | Does not invent structure (swap / wrap-rotate / monitor transfer / breakout). |
| **Launch** | Insert a new WINDOW next to the selected WINDOW or CON on that MONITOR (`mark2.md` Launch). |
| **visible group** | The open leaf the user can see on the active workspace/monitor (D105). |
| **in-slot** | TILE + right monitor + right parent + rect within ε (D040). User wait is per **visible group**, not whole-desk quiet (D105). |

**Slot-split vs even 3-way (D032, Mark 2 Launch on landscape):**

```text
Given:   Mon0(H(A@share, B@share))     # ~50/50 visible
Actions: Focus(A); Launch(C)
Expect:  Mon0(H(V(A,C)@share, B@share))
         not H(A,B,C) even thirds
```

A’s pane is taller than wide → wrap V. B keeps ~1/2 of the monitor.

---

## Out of nest

Nest is the E2E harness for extension JS (D022). These stay **host**
authority — do **not** add them as nest stories:

1. Host dual-4K physical geometry and true cold on that desk.
1. Real Chrome / PWA identity (Grok, YouTube, Gmail, Voice) and late
   activate of those apps.
1. Personal profiles (`dev`, `vinyl`, `t1`) and host `forge layout dev`.
1. Sleep/wake present-hold (D102) — host proof, not nest.
1. H1 / session-restore maze (parked, D100) — not v1 nest.

Helper-unit dumps and `layout dev` / personal profiles are **not
stories**.

---

## Deferred (design reason)

| Item | Why not a nest story yet |
| --- | --- |
| Tiny-pane → tab fallback | Opt-in; default **off**. Not the free-open contract. |
| yuiop resize / autotile | Parked behind a design blocker. Even 3-way **Given** may be **seeded** (reset-sizes already happened); do not add a resize trunk. |
| Host pointer maze / five-zone chrome bugs | Host DnD parked. Nest **may** run the Mark 2 pointer **leaf** below (named Ops only). Do not invent `Mark2Drop*`. |
| Portrait / square workarea Launch | Nest dummy is landscape. Portrait is out of nest unless a later nest `--size` campaign exists. |

---

## Oracles (every story)

Black-box only:

1. **Who sits where** — forest / `forge tree`: parent, children, order,
   H/V/TAB/STACK.
1. **Mode** — TILE or FLOAT (or GRAB_TILE only while grabbing).
1. **Identity** — this Nautilus / this Ghostty, not “some WINDOW”.
1. **Visible Meta/rect** — widths/heights of **visible** panes (open
   leaf; not buried peers unless the story is about them). ε from D095
   (ε₀ = 4 px). “~1/2” means half the **monitor workarea** in-axis,
   within ε — not ~1/3 or ~2/3 of the whole monitor.

Do **not** assert production function names, call order, or spies.

---

## Open

### `trunk.open.launch-into-2slot`

- **level:** trunk
- **covers:** open
- **monitors:** 1
- **expected fail:** no (nest trunk green; host dock Nautilus 1/3 is a
  **different Given** — product, not this nest story). Do **not**
  rewrite Expect so a dock-1/3 host desk goes green.
- **oracles:** who-sits-where; TILE; identity of `C`; visible widths of
  `A`, `B`, `C` vs monitor workarea.

Required trunk. Slot-split the focused unit (D032). Other sibling keeps
~1/2 (D090). Visible column is the contract (D105).

```text
Given:   Mon0(H(A@share, B@share))
         # two TILE windows, equal share or 50/50 percent; ~50/50 visible
Actions: Focus(A); Launch(C)
         # free-open third client: Nautilus or extra Ghostty
Expect:  Mon0(H(V(A,C)@share, B@share))
         B width ~1/2 monitor workarea
         A and C share the other column (same width as B; stacked)
         C is the launched client (this Nautilus / this Ghostty)
         A, B, C TILE
         not H(A,B,C) even thirds
         not V-column ~1/3 and B ~2/3 of the whole monitor
         not H(A,B,C) 1/3|1/3|1/3
```

Landscape: `A` is taller than wide → wrap V (`mark2.md` Launch).
MONITOR still has one child (the H CON) after settle.

---

### `branch.open.launch-into-2slot-other-focus`

- **level:** branch
- **covers:** open
- **monitors:** 1
- **expected fail:** no (same product bug may fail it; do not mark
  expected-fail unless the plan names this id)
- **oracles:** same as the trunk; identity of `C`; `A` keeps ~1/2.

```text
Given:   Mon0(H(A@share, B@share))
Actions: Focus(B); Launch(C)
Expect:  Mon0(H(A@share, V(B,C)@share))
         A width ~1/2 monitor
         B and C share the other column
         not H(A,B,C) even thirds
         not A ~2/3 and V ~1/3 of the whole monitor
```

Walk here when the trunk fails and focus was on the other slot.

---

### `branch.open.second-on-empty`

- **level:** branch
- **covers:** open
- **monitors:** 1
- **expected fail:** no
- **oracles:** who-sits-where after settle; TILE; ~50/50 visible.

Second tiled window on an empty head is a sibling of the first, then
MONITOR max-1 wraps (D032 + Mark 2 settle). Not a 3-way later.

```text
Given:   Mon0()
Actions: Launch(A); Focus(A); Launch(B)
Expect:  Mon0(H(A@share, B@share))
         A and B TILE; each ~1/2 monitor (landscape wrap H)
         MONITOR has one child
         not two sibling WINDOWs directly on MONITOR after settle
```

---

### `branch.open.launch-into-tab`

- **level:** branch
- **covers:** open, tabs
- **monitors:** 1
- **expected fail:** no
- **oracles:** TAB children order; one shared visible rect; identity of
  `C`.

TAB/STACK Launch adds a **next sibling** in the bag (`mark2.md`). Peers
share one slot (D069). Not a split of the group pane.

```text
Given:   Mon0(TAB(A,B))     # open leaf A
Actions: Focus(A); Launch(C)
Expect:  Mon0(TAB(A,C,B))
         open leaf A still visible (or C if Launch focuses the new WINDOW)
         A, B, C share one slot rect (~full monitor)
         not H(TAB(A,B),C) unless the selected slot was the TAB CON
         not a 50/50 split of the bag
```

---

### `leaf.open.launch-next-to-tab-con`

- **level:** leaf
- **covers:** open, tabs
- **monitors:** 1
- **expected fail:** no
- **oracles:** who-sits-where; TAB pane still one slot; `C` identity.

Select the **TAB CON** as the Launch slot (`mark2.md`: CON counts).

```text
Given:   Mon0(H(TAB(A,B),C))
Actions: Select(TAB); Launch(D)
Expect:  Mon0(H(V(TAB(A,B),D)@share, C@share))
         C width ~1/2 monitor
         TAB(A,B) and D share the other column
         A and B still one slot (open leaf unchanged unless Launch focus)
```

---

### `branch.open.empty-head-dock`

- **level:** branch
- **covers:** open
- **monitors:** 2
- **expected fail:** no
- **oracles:** `C` identity and monitor; Mon0 tree unchanged; TILE on
  Mon1.

Empty dest head (D027): pointer (else the window’s Meta mon) on a
monitor with **no TILE** homes there as mon-root. Beats LFT/focus so a
dock-miss cannot yank a right-head open onto the left tree. Dock dest
still wins when the dock/pointer is that empty head. Does **not** change
ordinary open when the pointer sits on a tiled head.

```text
Given:   Mon0(H(A@share, B@share)) | Mon1()
         Focus(A)                  # LFT on Mon0
Actions: Pointer on Mon1 (or dock open aimed at Mon1); Launch(C)
Expect:  Mon0(H(A,B)) unchanged
         Mon1(C)                   # TILE, sole child (or H wrap later)
         C is the launched client
         not Mon0(H(V(A,C),B))
         not C as a 3rd even sibling on Mon0
```

---

### `leaf.open.pointer-on-tiled-stays-lft`

- **level:** leaf
- **covers:** open
- **monitors:** 2
- **expected fail:** no
- **oracles:** `C` lands on Mon0; Mon1 still empty.

D027 does **not** apply when the pointer is on a **tiled** head.

```text
Given:   Mon0(H(A@share, B@share)) | Mon1()
         Focus(A); pointer on Mon0
Actions: Launch(C)                 # generic / terminal, not dock-to-Mon1
Expect:  Mon0(H(V(A,C)@share, B@share))
         Mon1() empty
         B width ~1/2 Mon0
```

---

## Close

### `trunk.close.three-equal-one-gone`

- **level:** trunk
- **covers:** close
- **monitors:** 1
- **expected fail:** no
- **oracles:** remaining identities; TILE; visible ~50/50 fill.

Even 3-way exists only after resize or reset-sizes (D032). **Given**
starts there (harness may seed). Close one → share repair (D090 / D078):
remaining `share` siblings split leftover equally; last `share` gone →
percents rescale to 100%. Remaining fill the monitor — not a 2/3 + gap.

```text
Given:   Mon0(H(A@share, B@share, C@share))
         # three equal TILE siblings (~1/3 each) after reset-sizes
Actions: Close(C)
Expect:  Mon0(H(A@share, B@share))
         A and B TILE; each width ~1/2 monitor
         not leftover ~1/3 + ~1/3 with a hole
         not A or B stuck at ~1/3
```

This is **not** the launch-after-2-slot trunk. Green close-reflow does
not prove D032 insert.

---

### `branch.close.split-unit-peer`

- **level:** branch
- **covers:** close
- **monitors:** 1
- **expected fail:** no
- **oracles:** unary collapse; `B` still ~1/2; identities `A`,`B`.

Close the new peer of a slot-split. Unary collapse (RuleSet, not a
second user Promote). Other sibling keeps its column.

```text
Given:   Mon0(H(V(A,C)@share, B@share))
Actions: Close(C)
Expect:  Mon0(H(A@share, B@share))
         B width ~1/2 monitor
         A fills the column C left
         V CON gone (unary)
```

---

## Tabs

### `trunk.tabs.open-leaf-one-slot`

- **level:** trunk
- **covers:** tabs
- **monitors:** 1
- **expected fail:** no
- **oracles:** open leaf identity; TAB/STACK children; **one** content
  rect for all TILE peers; sibling pane (if any) unchanged.

TABBED/STACKED children share **one** content rect (D069). Only the open
leaf is the visible app. Buried peers stay mapped. Tab click is not the
first size of a peer.

```text
Given:   Mon0(H(TAB(A,B)@share, C@share))
         open leaf A; B buried mapped; C TILE sibling
Actions: (observe after join/apply — no extra gesture)
Expect:  TAB(A,B) is one slot: A and B same Meta/rect (the group pane)
         A is the visible content (open leaf)
         C width ~1/2 monitor
         B is TILE, not FLOAT, not a second pane
         not B showing beside A
         not the tab pane shrinking to “only A”
```

---

### `branch.tabs.reveal-no-shrink`

- **level:** branch
- **covers:** tabs
- **monitors:** 1
- **expected fail:** no
- **oracles:** open leaf after reveal; group pane rect **unchanged**
  (within ε); sibling `C` unchanged; revealed child TILE.

Reveal (tab click or keybind) = show that child in the **same** slot
(D025, D069). Does not shrink the pane. Does not all-peer re-split.

```text
Given:   Mon0(H(TAB(A,B)@share, C@share))
         open leaf A; record TAB pane rect R and C rect
Actions: Reveal(B)
Expect:  open leaf B (visible content is this B)
         A buried mapped, still TILE, still same slot
         TAB pane rect still R (not smaller)
         C rect unchanged
         strip follows open leaf B (not keyboard-only if they differ)
```

---

### `branch.tabs.stacked-same-slot`

- **level:** branch
- **covers:** tabs
- **monitors:** 1
- **expected fail:** no
- **oracles:** STACKED peers one rect; reveal does not shrink.

Same slot law as TABBED (D069). STACKED is not a different geometry
**after** the STACK dest is settled. TAB→STACK adds title bars
(D109: N titles × `stacked-tab-bar-height`); that inset is the
toggle, not Reveal. Reveal(B) must not shrink further.

```text
Given:   Mon0(STACK(A,B))     # open leaf A; Meta at STACK dest
Actions: Reveal(B)
Expect:  Mon0(STACK(A,B))
         open leaf B
         A and B same slot rect as before reveal
         not a V split of A and B
```

---

## Layout

Profiles: **`_forge-test-*` only**. One spine (project.md): materialize
desired forest; missing roles **open into slots**; extras follow the
apply’s keep/close policy; **visible group** may become ready before
other heads (D105). `Done.ok` is forest match for required TILE slots,
not focus-only.

**Keep / close (named policies — harness picks one per run):**

1. **close extras** — TILE windows on the **target workspace** that are
   not in the desired forest are closed (Meta delete, never
   process-kill).
1. **keep extras** — those windows remain TILE on that workspace
   (companions already in a claimed slot stay; true residuals stay or
   park onto the last unit as tab peers — not dumped on another
   workspace or another monitor’s root).

Do not special-case a host desk. Roles are data.

---

### `trunk.layout.apply-one-ws`

- **level:** trunk
- **covers:** layout
- **monitors:** 1 (2 only if the `_forge-test-*` profile names two heads)
- **expected fail:** no
- **oracles:** forest match vs desired; TILE identities per role;
  visible open leaf; percents/`share` of visible panes.

One workspace. Desired forest. Missing roles open. Structure is
construction, not a cleanup pass.

```text
Given:   WS1 empty or occupied with unmatched TILE windows
         profile `_forge-test-*` desired e.g. Mon0(H(A@share, B@share))
Actions: Apply that profile on WS1 only
Expect:  WS1 Mon0(H(A,B)) as desired (order + layout + roles)
         A, B TILE; identities match claimed roles
         missing roles were opened (not left empty)
         visible ~50/50 if the profile is two equal shares
         one command finishes the visible group (no “run layout again”)
```

---

### `branch.layout.missing-roles-open`

- **level:** branch
- **covers:** layout, open
- **monitors:** 1
- **expected fail:** no
- **oracles:** new client identity in the **slot**, not mon-root dump;
  other claimed windows unmoved.

```text
Given:   WS1 Mon0(A)     # role A present; role B missing
         profile wants Mon0(H(A,B))
Actions: Apply `_forge-test-*`
Expect:  Mon0(H(A,B))
         B is the newly opened client in the B slot
         A still A (same identity)
         not B FLOAT leftover
         not a 3rd sibling if extras exist — extras follow policy
```

---

### `branch.layout.extras-policy`

- **level:** branch
- **covers:** layout, close
- **monitors:** 1
- **expected fail:** no
- **oracles:** presence/absence of extra identity `D`; desired `A`,`B`
  still in-slot.

```text
Given:   WS1 Mon0(H(A,B)) plus extra TILE D (not a profile role)
         profile wants Mon0(H(A,B))
Actions: Apply `_forge-test-*` with **close extras**
Expect:  D gone from TILES on WS1
         Mon0(H(A,B)) desired; A and B identities unchanged

Given:   same desk
Actions: Apply `_forge-test-*` with **keep extras**
Expect:  A, B still in desired slots
         D still TILE on WS1 (coexist in a slot or tab-parked on last unit)
         D not moved to another workspace
```

---

### `branch.layout.ws2-no-mutate-ws1`

- **level:** branch
- **covers:** layout
- **monitors:** 1 (2 workspaces)
- **expected fail:** no
- **oracles:** WS1 forest fingerprint unchanged (who-sits-where +
  identities + visible rects); WS2 matches its profile.

Layouts are task desks: one apply sees **only** the target workspace.
Matching class/title on another workspace is invisible. Open missing
lands on the **target** workspace.

```text
Given:   WS1 Mon0(H(A,B))     # record tree + rects + identities
         WS2 empty or other
Actions: Apply `_forge-test-*` on WS2
Expect:  WS1 identical to Given (no move, close, open, or structure)
         WS2 matches the profile
         new opens (if any) are on WS2 only
```

---

### `leaf.layout.apply-tab-open-leaf`

- **level:** leaf
- **covers:** layout, tabs
- **monitors:** 1
- **expected fail:** no
- **oracles:** open leaf = profile `active` / intended role; group one
  slot; strip matches open leaf.

```text
Given:   profile `_forge-test-*` wants Mon0(TAB(A,B)) open leaf A
Actions: Apply on WS1
Expect:  Mon0(TAB(A,B))
         open leaf A visible
         A and B one slot
         not B covering A as the visible content
```

Host Chrome-over-Grok is **out of nest** (PWA identity). Nest uses
Ghostty / Nautilus / TextEditor (or nest-isolated clients).

---

### `leaf.layout.apply-inkscape-ws2`

- **level:** leaf
- **covers:** layout
- **monitors:** 2
- **expected fail:** no
- **oracles:** dest-mon Inkscape (or stand-in) TILE in-slot; no leftover
  `forge-ph`; WS1 forest fingerprint unchanged.

Vinyl-shaped apply on **WS2** after an occupied WS1. Profile
`_forge-test-inkscape-ws2` (not personal `vinyl`). YouTube/Chrome PWA
stand-in is TextEditor (documented on the profile). If Inkscape does
not map in nest, fail honest (not XFAIL).

```text
Given:   WS1 Mon0(H(A,B))     # record tree + rects + identities
         WS2 empty
         profile `_forge-test-inkscape-ws2`
           Mon0(Inkscape) | Mon1(H(Ghostty, TAB(TextEditor, Ghostty)))
Actions: Apply that profile on WS2
Expect:  WS1 identical to Given
         WS2 Mon1(H(Ghostty, TAB(TextEditor, Ghostty)))
         no leftover forge-ph
         Inkscape (if mapped): TILE in-slot **or** honest D115 TAB/FLOAT
         (FLOATS bag, not under a MONITOR). Fail if stuck ~700×651 TILE
         in a full slot.
```

---

## Mark 2

Named **Ops** only: Move, Join, Group, Launch (`mark2.md`). Keyboard or
pointer `release` → the same Ops. Do **not** invent `Mark2Drop*`.
v1 Move/Join/Group act on a WINDOW leaf.

---

### `trunk.mark2.join-enter`

- **level:** trunk
- **covers:** mark2, tabs
- **monitors:** 1
- **expected fail:** no
- **oracles:** who-sits-where; TAB membership; unary of emptied CON;
  identities.

Worked Join from `mark2.md`: enter the in-axis TAB at the near edge.
C is the **left-edge** child of the right TAB (`TAB(C,D)`, not
`TAB(D,C)`). CENTER Group appends the joiner — Given must not Join that
last child left (that wrap-pairs `V(C,D)`).

```text
Given:   Mon0(H(TAB(A,B), TAB(C,D)))
Actions: Select(C); Join(left)
Expect:  Mon0(H(TAB(A,B,C), D))
         C entered TAB(A,B) at the near (right) edge
         D TILE in the other slot (unary left D)
         not TAB(C,D) wrapped as a pair
         not H(TAB(A,B),V(C,D)) in-tab wrap-pair
         not H(A,B,C,D) flatten of tabs
```

---

### `branch.mark2.join-flatten`

- **level:** branch
- **covers:** mark2
- **monitors:** 1
- **expected fail:** no
- **oracles:** four TILE siblings under H; identities.

Join flattens a cross-axis **split** CON (promote-join). Not wrap-pair
TAB.

```text
Given:   Mon0(H(V(A,B), V(C,D)))
Actions: Select(C); Join(left)
Expect:  Mon0(H(A,B,C,D))
         not H(TAB(C,D), …)
         not V(A,B) left intact with C wrapped
```

---

### `branch.mark2.move-swap`

- **level:** branch
- **covers:** mark2
- **monitors:** 1
- **expected fail:** no
- **oracles:** order only; layout unchanged; TILE.

Move does not invent structure. In-axis neighbor → swap.

```text
Given:   Mon0(H(A,B,C))
Actions: Select(A); Move(right)
Expect:  Mon0(H(B,A,C))
         still HSPLIT; still three TILE siblings
         not a wrap or tab
```

---

### `branch.mark2.group-tab`

- **level:** branch
- **covers:** mark2, tabs
- **monitors:** 1
- **expected fail:** no
- **oracles:** TABBED pair; one slot; identities.

Group is tab intent. Two H siblings → TAB.

```text
Given:   Mon0(H(A,B))
Actions: Select(A); Group(right)
Expect:  Mon0(TAB(A,B))
         A and B one slot (~full monitor)
         not V(A,B)
         not still H(A,B)
```

---

### `leaf.mark2.move-empty-monitor`

- **level:** leaf
- **covers:** mark2
- **monitors:** 2
- **expected fail:** no
- **oracles:** `A` on Mon1; `B` remains on Mon0; both TILE.

Pointer empty-monitor hit is Move onto that MONITOR (`mark2.md`).
Keyboard Move transfers at the MONITOR edge.

```text
Given:   Mon0(H(A,B)) | Mon1()
Actions: Select(A); Move onto empty Mon1
         # pointer empty-monitor (skips inner-edge gate)
Expect:  Mon0(B) | Mon1(A)
         A, B TILE
         A not a FLOAT
         Mon0 unary to B
```

Keyboard Move at an in-axis H/V edge **wraps** (wrap beats cross-mon).
Empty dest from a 2-child split is pointer Move `onto` MONITOR, or
Join at the MONITOR edge (next leaves).

---

### `leaf.mark2.move-empty-monitor-reverse`

- **level:** leaf
- **covers:** mark2
- **monitors:** 2
- **expected fail:** no
- **oracles:** `A` on Mon0; `B` remains on Mon1; both TILE.

Same contract as `leaf.mark2.move-empty-monitor`, dest empty **Mon0**.

```text
Given:   Mon0() | Mon1(H(A,B))
Actions: Pointer empty-monitor grab=A onto Mon0
Expect:  Mon0(A) | Mon1(B)
         A, B TILE
         Mon1 unary to B
```

Nested VSPLIT child is **leaf-only** (R022): drag C from
`Mon1(H(A,V(B,C)))` onto empty Mon0 moves C only.

---

### `leaf.mark2.join-empty-monitor`

- **level:** leaf
- **covers:** mark2
- **monitors:** 2
- **expected fail:** no
- **oracles:** edge leaf on dest; peer stays; both TILE; not a no-op.

Join step 1: MONITOR edge + neighbor → `transferLeafToMonitor`
(`join:true`). Empty dest is transfer, not wrap-pair and not a no-op.
Both directions. Keyboard Move still wraps at an in-axis H edge.

```text
Given:   Mon0(H(A,B)) | Mon1()
Actions: Select(B); Join(right)
Expect:  Mon0(A) | Mon1(B)
         A, B TILE
```

```text
Given:   Mon0() | Mon1(H(A,B))
Actions: Select(A); Join(left)
Expect:  Mon0(A) | Mon1(B)
         A, B TILE
```

---

### `leaf.mark2.pointer-center-group`

- **level:** leaf
- **covers:** mark2, tabs
- **monitors:** 1
- **expected fail:** no
- **oracles:** TAB pair; one slot.

Pointer CENTER is **Group**, never Join (`mark2.md`, D101).

```text
Given:   Mon0(H(A,B))
Actions: Pointer release grab=A hit=window B center
Expect:  Mon0(TAB(A,B))
         not Join invent V/H
```

---

## Float

### `trunk.float.not-under-monitor`

- **level:** trunk
- **covers:** float
- **monitors:** 1 (2 if the FLOAT spans heads — still not a MONITOR child)
- **expected fail:** no
- **oracles:** mode FLOAT; forest parent is **not** a MONITOR; TILE
  siblings unchanged.

FLOAT lives in **FLOATS**, not under a MONITOR (D087). A float can span
heads; a mon-local parent is a lie.

```text
Given:   Mon0(H(A,B))
Actions: Float(C)     # C was TILE, or a new always-float client maps
Expect:  C mode FLOAT
         C not a child of Mon0 (or any MONITOR)
         Mon0 still H(A,B) (or unary if C was a sibling)
         A, B TILE
```

---

### `branch.float.retile-into-tiles`

- **level:** branch
- **covers:** float, mark2, open
- **monitors:** 1
- **expected fail:** no
- **oracles:** `C` becomes TILE under TILES; not left in FLOATS.

Re-tile = Launch / Join into TILES — not a ghost slot on the old parent.

```text
Given:   Mon0(H(A,B)); C FLOAT (not under Mon0)
Actions: Join or Launch-place C next to A
Expect:  C TILE under Mon0’s tree (slot-split A if H already has siblings)
         C not in FLOATS
         B still ~1/2 if A was slot-split
```

---

### `leaf.float.fail-safe-terminator`

- **level:** leaf
- **covers:** float, settle
- **monitors:** 1
- **expected fail:** no
- **oracles:** FLOAT terminator; no lying TILE under a too-small slot.

If the host cannot honor a TILES placement, FLOAT is the reconcile
fail-safe (D093). The loop terminates. Do not leave a TILE parent with a
window the user sees as unmanaged-and-also-a-slot.

```text
Given:   a TILE placement the host cannot honor (mins / dest)
Actions: map or re-tile that client
Expect:  window is FLOAT (FLOATS bag), not a MONITOR child
         remaining TILES still a legal forest after settle
```

Skip in the default nest campaign unless the harness can force a
non-honor case without reading production helpers. Still part of RC
when that fixture exists.

---

## Settle

### `trunk.settle.visible-group-ready`

- **level:** trunk
- **covers:** settle, layout
- **monitors:** 2
- **expected fail:** no
- **oracles:** **visible** Mon0 (or focused head) who-sits-where +
  Meta/rect + open leaf. Do **not** require Mon1 quiet as a pass
  condition for this story.

Visible settle (D105): what the user waits on is the **visible group**
on the active workspace. Buried tab peers, hidden maps, and **other
monitors may finish in the background**. Do not fail because an
off-screen window is still settling if the current view is already
correct. Do fail if the visible pane is wrong (1/3|2/3, wrong open
leaf, fly-in the user can see).

```text
Given:   two heads; apply or open so Mon0 desired group is in-slot
         Mon1 still mapping / not yet in-slot
         user view is Mon0 (active workspace, focused head)
Actions: assert visible ready (do not wait whole-desk quiet)
Expect:  Mon0 visible forest + rects + open leaf already match
         story PASSES even if Mon1 is still mapping
         story FAILS if Mon0 visible pane is wrong
```

This does **not** license a permanently wrong Mon1. RC still has
layout/open trunks that eventually require Mon1 in-slot. This trunk
forbids **blocking the visible group** on the other head.

---

### `leaf.settle.visible-first-open`

- **level:** leaf
- **covers:** settle, layout, tabs
- **monitors:** 1
- **expected fail:** no
- **oracles:** once the TAB group has ≥1 mapped WINDOW, the open leaf is
  the profile `active` (strip). Do **not** wait for the buried peer.

```text
Given:   apply `_forge-test-tab-open-leaf` → Mon0(TAB(A,B))  # A active
Actions: wait until the group has a mapped window
Expect:  open leaf / strip is A as soon as the first WINDOW exists
         do not FAIL because B is still mapping
         FAIL if B is shown as the open leaf
```

Hide-place-show (no fly-in) is unit-proven; nest has no opacity oracle.

---

### `branch.settle.buried-peer-background`

- **level:** branch
- **covers:** settle, tabs
- **monitors:** 1
- **expected fail:** no
- **oracles:** visible open leaf rect/identity; do not require buried
  peer’s Meta quiet as the pass gate.

```text
Given:   Mon0(TAB(A,B))     # open leaf A already in-slot and visible
         B still mapping or still catching the shared slot
Actions: assert visible ready
Expect:  visible content is A; A rect is the group slot
         do not FAIL solely because B has not finished mapping
         FAIL if A is the wrong size or B is shown instead of A
```

---

### `leaf.settle.jitter-same-dest`

- **level:** leaf
- **covers:** settle, layout
- **monitors:** 1
- **expected fail:** no
- **oracles:** Ghostty-class pair stays H(A,B) TILE after settle; no TAB
  wrap; no FLOAT. Same dest (D115 jitter / D111) — no topology change.

```text
Given:   profile `_forge-test-one-ws` Mon0(H(A,B)) two Ghosttys
Actions: apply; wait visible settle
Expect:  Mon0(H(A,B)) both TILE
         no TABBED/STACKED bag
         no FLOATS
```

---

## Seed coverage

| # | Seed | Story |
| --- | --- | --- |
| 1 | Launch into a 2-child split (D032, D090, D105) | `trunk.open.launch-into-2slot` |
| 2 | Close 1 of 3 equal tiles → remaining fill | `trunk.close.three-equal-one-gone` |
| 3 | TABBED/STACKED one open leaf; reveal does not shrink | `trunk.tabs.open-leaf-one-slot`, `branch.tabs.reveal-no-shrink`, `branch.tabs.stacked-same-slot` |
| 4 | Layout apply one WS; desired forest; missing open; extras policy | `trunk.layout.apply-one-ws`, `branch.layout.missing-roles-open`, `branch.layout.extras-policy` |
| 5 | Layout on WS2 does not mutate WS1 | `branch.layout.ws2-no-mutate-ws1`, `leaf.layout.apply-inkscape-ws2` |
| 6 | Mark 2 Join / Move / Group | `trunk.mark2.join-enter`, `branch.mark2.join-flatten`, `branch.mark2.move-swap`, `branch.mark2.group-tab` |
| 7 | FLOAT not under a MONITOR (D087) | `trunk.float.not-under-monitor` |
| 8 | Empty-head / dock open lands on empty dest (D027) | `branch.open.empty-head-dock` |
| 9 | Visible group ready while another mon still mapping (D105) | `trunk.settle.visible-group-ready` |
| 10 | Ghostty-class jitter same dest, no topology (D115) | `leaf.settle.jitter-same-dest` |
| 11 | Visible-first TAB open leaf (D117) | `leaf.settle.visible-first-open` |

**Catalog `expected_fail`:** none. Nest
`trunk.open.launch-into-2slot` is green (`dock=false` free-open). Host
dock-open 1/3 (`BVHnV`) stays a **product** bug
(`forge-core-slot-geometry`), not a nest expected-fail. Expect for
this trunk is unchanged.
