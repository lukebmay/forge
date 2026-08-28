# Plan: Container motion, peel & join design

**Status:** design (discussion open — **no implement until locks + HTML prototype**)  
**Priority:** P1 design (after workspace-scope implement path; before more peel/move hacks)  
**Created:** 2026-08-06  
**Branch:** `plan/forge-container-motion-design` (docs + prototype only until locks)  
**Kind:** Product design → HTML prototype → then implement tasks  

### Session note (overwrite)

**2026-08-27g — Proto stream parked:** Mark 2 proto + TOM kernel committed.
Next session is **firm-abstractions refactor planning** (scan all open
plans: close / abandon / pull in). Cold-continue for this proto lives in
**§ Parked HANDOFF extract** below and
[`prototypes/container-motion/src/opsets/mark2.md`](../../prototypes/container-motion/src/opsets/mark2.md).
Do not re-copy locks into `HANDOFF.md`.

**2026-08-27f — Share rescale + dock launch:** Leave an H/V → node
floats (sized shares do not follow). Last floater gone → rescale remaining
sized to 100% (ratios kept). Unary collapse still copies the CON slot.
Dock launch = `Launch(MonN)` (per-monitor buttons). Guake/`a` = `Launch()`
on the selection’s monitor. `q` = OpSet Remove. `npm test` 144 green.

**2026-08-27e — Launch CON slot + TAB size + float-all:** Launch selected =
WINDOW or CON on that monitor (`p` counts). Treat CON as the slot. Worked:
`H(TAB(A,B),C)` select TAB → `H(V(TAB(A,B),D),C)`. Same-type wrap of H/V
CON: MONITOR → opposite split; nested → last child. TAB/STACK size ops
(nudge/preset/float/`e`) target the bag slot. `Alt+/` floats every node.
`npm test` in the proto dir (140 green).

**2026-08-27d — Launch + float parent:** Mark 2 Launch in `mark2.md`:
selected = WINDOW leaf on that monitor; else append at end. TAB/STACK next
sibling; H wider-than-tall → sibling else wrap V; V taller-than-wide →
sibling else wrap H; 10% floor → TAB wrap. MONITOR sole window wraps in
place. Float **parent** = ancestor whose share is the child’s cross-axis.
Keys: `Alt+yuio` / `Alt+nm,.`. **Launch leaf-only superseded by 2026-08-27e.**

**2026-08-27c — tree graph + sizing:** Renderer uses real ROOT→WS1→MONITOR
(no fake “forest” node). In-axis shares on H/V children; cross-axis is the
parent container’s share. Float = not userSized. Floor 10%. Resize
`Alt+hjkl` / presets `7890`. Float keys **superseded** by 2026-08-27d.

**2026-08-27b — Mark 2 design doc + Join tab:** Source of truth is
[`src/opsets/mark2.md`](../../prototypes/container-motion/src/opsets/mark2.md).
Breakout = Promote. Unary collapse = 1-child CON deleted, child takes its
place. Spine ROOT→WS→MONITOR. Join `H(TAB(A,B),TAB(C,D))` C← →
`H(TAB(A,B,C),D)` (was throw/no-op: missing `insertBefore`; enter at near
edge). Changing mark2.md ⇒ same-effort code + tests. `npm test` is the brake.

**2026-08-27 — TOM / OpSets:** Prototype kernel is `src/tom/` (atomics +
composed TreeOps + shorthand). Mark 2 is an **OpSet** (`src/opsets/mark2.mjs`),
not “molecular.” Green + wrong desk ⇒ paint. “Molecule” retired; do not put
wrap/cross-mon/join into TOM atomics.

**2026-08-26l — proto plog + abstract regressions:** Prototype-local single-sink
plog (`src/plog.mjs`, not forge tapes). `npm test` runs Given/Action cases on
the abstract tree — green suite + wrong desk ⇒ paint bug, not policy.

**2026-08-26k — join edge breakout + cross-axis promote:** `H(V(A,B),V(C,D))`
C Join← must **not** wrap-pair into `TAB(C,D)`. Nested pair wrap-pair only when
breakout is impossible (mon sole-child). Else: breakout → unary cleanup → join
in dir. Join into **cross-axis** sibling CON promotes that CON’s kids into the
parent and inserts the leaf at the boundary → `H(A,B,C,D)`. In-axis sibling CON
still enter-con.

**2026-08-26j — edge wrap rotate + Move→OpSet:** `H(A,B)` A← must become
`H(B,A)` (in-axis edge **rotate**, not cross-mon / not silent fail). Causes of
apparent no-op: (1) persisted Mark 1 `edgeMove=noop` — migrate once to `wrap`
under Mark 2 policy; (2) TreeOp **Move** used cross-mon-first while OpSet move
wrapped — with policy on, `move:*` now calls OpSet `Move`. TreeOp `moveDir`
is in-axis swap only (no wrap). Wrap is rotate-to-other-end (n=2 ≡ swap).

**2026-08-26i — move wrap before cross-mon:** Mark 2 move in-axis edge
**wrap** (pref) must beat monitor transfer. Was: `isAtMonitorEdge` first →
`TAB(A,B)` A← and `H(A,B)|H(C,D)` B→ stole to the other mon. Now: in-axis
swap/wrap → then cross-mon (only if parent cannot wrap) → breakout.
`isAtMonitorEdge` requires in-axis at each ancestor (no false edge on VSPLIT←).

**2026-08-26h — half-width tab:** Proto desk applied sibling `percent` flex to
the open tab pane child (stale 0.5 from former split). Fix: `fill: true` for
tab/stack pane; `setLayout` into TAB/STACK equalizes. Forge: enter TAB/STACK
`setLayout` clears sibling percents; `computeSizes` returns full slot for bags
(paint already ignored percent — D069 Meta lag is separate).

**2026-08-26g — H(A,TAB(B,C)) join B↔C → V:** Emptied TAB/STACK invents vs
**host** (Join under H→V), not aspect-vs-TAB (which coerced H under H→TAB no-op).
Emptied H/V still invents opposite of former split.

**2026-08-26f — prune empty after OpSet ops:** `mark2CleanupUnder` prunes
**any** 0-child CON (H/V/TAB/STACK) then collapses unary (loop). Emptied parent
on 2-leaf join is replaced in place. Empties remain atomic-only escape hatches.

**2026-08-26e — join TAB fallback + 2-leaf any-dir:** Same-type H/V repair is
**TABBED** (not H↔V flip) — flipping on unary promote undid invent
(VSPLIT(A,B)→H→promote into H parent→was V again). Invent join wrap: opposite
vs host; if that layout equals a CON child → TAB. Two window leaves under one
parent: any join dir wraps the pair (not only toward-sibling). Under mon,
2-leaf V→net H / H→net V; nested under same-orient CON → TAB bag.

**2026-08-26d — abstract settle + 2-leaf join:** OpSet ops mutate a
**cloned** forest then `applyForestSnapshot` once (no mid-gesture display
thrash). 2-leaf VSPLIT↔join→HSPLIT uses full invent+unary path; **deferred
opt** = detect and flip parent layout in place. Same-type coerce is CON↔CON
only (never vs MONITOR layout).

**2026-08-26c — monitors as siblings:** Display geometry decides implicit
monitor sibling axis (centers spread → **HSPLIT** side-by-side vs **VSPLIT**
stacked; tie → `aspectTieBreak`). TreeOp + OpSet move/join (and focus)
cross that edge like moving toward a sibling CON. Helpers in
`prototypes/container-motion/src/monitors.mjs`.

**2026-08-26b — Mark 2 locks (prototype-only):** Named lineage Mark 0 / 1 / 2
(see below). Mark 2 is **HTML prototype experiment only** — may be adopted,
changed, or abandoned before any Shell ship. Locked answers from this meeting
folded into § Mark 2. Proto gained Mark 2 OpSet (`src/opsets/mark2.mjs`), size atomics, layout
cycle `[`/`]`, OpSet `m`/`n`/`{`/`}`, prefs (tie-break H, default join
SPLIT|TAB, policy toggle).

**2026-08-26a — rules draft:** Operator proposed Mark 2 policy (monitor
max-1-child, no same-type, no unary CON, directional move/join). Explicitly
**supersedes** 2026-08-06 leans on D3/D5 for the *prototype* track.

**2026-08-06:** Mark 1 design discussion (peel B, edge noop lean, explicit
join). Superseded for proto by Mark 2; Shell still runs Mark 0 Move + Mark 1 C4.

---

## Parked HANDOFF extract (2026-08-27)

Moved out of `HANDOFF.md` so the next session can start on **firm
abstractions**. Use this during the plan scan; **do not** treat it as the
live queue.

**Stream:** `prototypes/container-motion/` — TOM kernel + Mark 2 OpSet.
Not Shell Move. Proto: `npm start` → http://localhost:5177/ (port **5177**).
Settings: Mark 2 on, **Edge move = wrap**. Hard-refresh after edits.
Suite **144 green** (`cd prototypes/container-motion && npm test`).

**FIRM process (until the refactor plan supersedes it):**

1. OpSet source of truth: `prototypes/container-motion/src/opsets/mark2.md`.
   Edit that file ⇒ edit `mark2.mjs` + tests in the same effort.
2. TOM stays clean. No wrap/cross-mon/join in `src/tom/` atomics.
3. Before any OpSet/TOM edit: `cd prototypes/container-motion && npm test`.
4. New desk bug: failing case first, then fix.
5. Green suite + wrong desk ⇒ paint, not the TOM.

**Locked behaviors:** `mark2.md` + proto README. Newest CHANGELOG row for
the topic wins (D073–D078). Do not duplicate the case table here.

**Known seam:** monitor neighbor / `transferLeafToMonitor` still in
`src/monitors.mjs` (world + a bit of max-1 wrap). Optional cleanup: that
transfer should be TreeOps + Mark 2 wrap, not a world-module splice.

**Host leftovers (not this proto):** D069 tab-peer tip, Super+2 settle,
DING ⅓, D049 tiny-env, OH host verify, chaos nest. Prefer nest for Shell
code→reload. Hunts: `forge log` only.

**Paths:** `src/tom/` kernel · `src/opsets/mark2.mjs` · `src/tree.mjs`
presenter · `test/` four-layer suite.

---

## Design lineage (names)

| Mark | Meaning | Where it lives |
| --- | --- | --- |
| **Mark 0** | EGO / jcrussell directional Move: i3-like climb, swap sibling, **auto-join CON**, **auto-peel** on edge/perpendicular, mon wrap / cross-mon | Shell `tree.move` / `next` (still the live Move path) |
| **Mark 1** | Luke FCC + C4: keep Mark 0 Move; add explicit `moveIn` / `moveOut` / focus parent; LX2 pair peel aspect; 2026-08-06 design lean toward tame edges + explicit join | Shell C4 + motion-design early leans |
| **Mark 2** | Prototype policy pack: unary forbid, same-type forbid, mon max-1, in-axis wrap, cross-axis breakout, directional invent-join, mins→TAB→float | **`prototypes/container-motion/` only** until MD2 says ship |

Newest design meeting **wins** for the prototype track. Shell stays Mark 0+1 until an explicit adopt decision.

---

## Why

Directional move, peel-from-tab, join, and nested CON ops are converging into
one product surface. Ad-hoc rules (reparent under mon HSPLIT, pop out at sibling
edge, “who absorbs whom”) produce slivers and mental models users cannot hold.

We need **locks + a prototype** before more Shell patches.

## Related plans (do not fork history)

| Plan | Role |
| --- | --- |
| [forge-first-class-containers](./forge-first-class-containers.md) | Spine: setLayout, group/ungroup, chrome, C4 API |
| Container selection (S0–S2 on `plan/forge-first-class-containers`) | Sticky unit selection, bag chrome, ops matrix; **S3** kit binds |
| [forge-layout-live-x11](./forge-layout-live-x11.md) LX2 | Peel aspect reorient when parent is pair only |
| [forge-tab-chrome-drag](./forge-tab-chrome-drag.md) | Browser-like mouse DnD — **after** this design + dual-session |
| [forge-layout-workspace-scope](./forge-layout-workspace-scope.md) | Desks = workspaces — **P0 implement first** |

This plan **owns** motion/peel/join/direction semantics and the **HTML prototype**.
Selection chrome colors may refine S0; implement still waits on locks.

---

## Operator symptoms (2026-08-06)

1. Peel tile out of **tall tab group** → vertical sliver (often mon HSPLIT parent).
2. Mouse tab drag not browser-like (separate plan; note only).
3. Fear that directional move “past end of siblings” auto-pop-out fights explicit
   move-out / parent ops.
4. Directional join + CON-into-CON + nested H/V is hard to reason about.

---

## Design discussion (include agent thoughts)

### 1. Peel from multi-member tab/stack — Model B (lean lock)

**Agreed direction:** The tab/stack **bag is the unit of structure**, not the mon
parent. Peeling window W from bag G:

1. Remove W from G (G remains TABBED/STACKED if ≥2 members; else collapse rules).
2. **Replace G’s former slot** with a **new split CON** S whose children are
   `[G′, W]` (order: peeled side follows move direction if any; else aspect).
3. Choose **HSPLIT vs VSPLIT** for S from:
   - move direction if present (L/R → H, U/D → V), else
   - **aspect of G’s pre-peel rect** (tall → VSPLIT bands; wide → HSPLIT columns).
4. S takes G’s old percent under the grandparent. Other mon siblings **unchanged**.

**Why not pure reparent (Model A):** Reparenting W as sibling of G under mon
HSPLIT invents a new mon-level column → slivers. Parent of G is often “irrelevant”
to the user’s intent: they split **the bag’s column**, not the whole mon.

**Nesting consequence (accepted):** You can get `VSPLIT(TABBED, WINDOW)` under
mon HSPLIT, or even VSPLIT-in-VSPLIT after repeated peels. That is **honest tree
structure**, same class of nesting first-class containers already allow. Flatten
is a separate polish (normalize adjacent same-axis splits) — optional later, not
required for peel v1.

**LX2 relationship:** LX2 reorients only when parent is exactly pair
`[G|W]`. Model B **creates** that pair as a **new CON in G’s slot**, so aspect
always applies even when mon had more children. Prefer B over extending LX2’s
pair-only gate.

### 2. Move past siblings — stop auto-pop-out?

**Operator lean:** Do **not** pop out of container when directional move passes
the end of the sibling list. Pop-out / join should be **explicit** (move-out,
move-in, group, elevated selection).

**Agent agreement:** Edge pop-out is a classic tiling footgun (i3 users learn it;
casual users get lost trees). With sticky **selection** + explicit move-out/in
(S0–S2), default directional move should be:

| Scope | Behavior |
| --- | --- |
| **Within parent** | Reorder among siblings (or swap with neighbor leaf/unit) |
| **At edge of parent** | **No-op** (or wrap *within* parent if we ever want wrap — default **no-op**) |
| **Leave parent** | Explicit **move-out** (or peel if leaving tab/stack bag) |
| **Enter sibling CON** | Explicit **move-in** / join |

This keeps hjkl (or Super+hjkl) **locally predictable**.

### 3. L/R vs U/D semantics — three competing models

| Model | L/R | U/D | Pros | Cons |
| --- | --- | --- | --- | --- |
| **M1 Geometric** | Spatial neighbor on mon | Spatial neighbor | Matches eyes | Ignores tree; hard nested |
| **M2 Axis-of-parent** | Along parent H axis | Along parent V axis; if parent H-only, U/D no-op or focus parent | Tree-honest | U/D dead in pure H mon |
| **M3 Dual role** | Sibling order | Ancestral (parent / invent child group) | Powerful | **Confusing**; invent rules explode |
| **M4 Collapse dirs** | L=U, R=D as “prev/next sibling” | same | Simple in tab strip | Loses 2D desk motion |

**Operator noted:** In a tab group, “down ≈ right, up ≈ left” (strip order). Also
explored ancestral U/D + sibling L/R — then “make child group” needs a partner
sibling and raises absorb rules (a–e below).

**Agent recommendation (draft — not locked):**

1. **Default move = geometric within current parent’s children only** (M2 with
   geometric tie-break among siblings). No edge pop-out.
2. **Tab/stack bags:** directional move of a **leaf** = reorder strip (M4 for
   members inside bag); peel uses Model B when user **move-out** or peel chord /
   drag-out — not when reordering.
3. **Do not** overload U/D as “make group” without **selection multi-target** —
   that is how we avoid a–e at the keyboard default layer.
4. **Elevated CON selection:** move L/R/U/D moves the **whole bag** as a unit
   among its siblings (S2 matrix) — still no edge auto-pop.

### 4. Join / group absorb mess (operator cases a–e)

If “move down = make child group with next sibling”:

| Case | Question |
| --- | --- |
| a | No siblings → no-op |
| b | Next is leaf → invent split/tab? maximize squareness? |
| c | Next is CON → join into it vs wrap both? |
| d | Self is CON, next is leaf → symmetric to c |
| e | Both CONs → who absorbs whom? layout mode? |

**Agent view:** These cases are why **directional invent-group is a bad default**.
Average users cannot predict e. Prefer:

| Op | Meaning |
| --- | --- |
| **group / merge** | Explicit: selection multi-target (cyan) + commit → one CON |
| **move-in** | Explicit: unit enters **existing** sibling CON only (current C4) |
| **layout cycle** | Change mode of **selected** CON only |
| **Directional move** | Never invent structure (except peel Model B as “leave bag”) |

**Who absorbs whom (if we ever need directional join):** Prefer **geometry +
selection**, not “always right wins”:

- If one target is elevated CON and other is leaf → leaf joins CON (CON absorbs).
- If both CONs elevated / multi-select → **new parent** CON with mode from
  user (default tabbed for group; or last layout-cycle) — neither silent absorb.
- Never silent flatten of two H splits into one without user layout intent.

Document as **open** until prototype plays through a–e without confusion.

### 5. Selection multi-target (operator idea — strong)

S0 locked **sticky single unit** (focus leaf or elevated CON), not mode-first.

Operator proposal for richer group building:

| Role | Color (suggestion) | Meaning |
| --- | --- | --- |
| **Focus** | Existing purple/red | Where you type (Meta) — **unchanged** |
| **Ops cursor / unit** | Magenta | What directional move/resize acts on |
| **Merge set** | Cyan | Units tagged for upcoming group/merge |
| **Drop / result locus** | Optional third | Where the new CON will sit |

**Agent view:** This is the right way out of a–e **if** we accept a short
“tag → commit group” flow. It matches S0’s “two layers” spirit (focus ≠ selection)
and extends selection to a **set**. Cost: more keys (tag, untag, commit, clear)
and chrome discipline.

**Phasing suggestion:**

1. Keep S0 single sticky unit for move/swap/layout (ship S3 binds).
2. Prototype multi-tag + group commit in HTML **before** Shell multi-select.
3. Peel Model B can ship without multi-tag (single-unit leave bag).

### 6. Nested same-axis splits

After Model B peels, trees may look “redundant” (VSPLIT in VSPLIT). Options:

| Policy | When |
| --- | --- |
| **Allow** (default design) | Honest; session restore simple |
| **Normalize** optional | Merge adjacent same-axis single-child chains on idle — careful with percents |

Do not block peel on fear of nesting; normalize is a separate cleanup pass.

### 7. Explicit ops vs clever directions (summary stance)

| Prefer explicit | Prefer directional |
| --- | --- |
| move-out / move-in | sibling reorder inside parent |
| group/ungroup with selection | peel-out of bag (Model B) as leave-group |
| focus-parent / focus-child | geometric neighbor among **siblings only** |
| multi-tag merge (later) | — |

**Avoid:** edge auto-pop, silent absorb, U/D invent-group without selection.

---

## Mark 2 (2026-08-26 — prototype locks)

**Scope:** HTML prototype only. TOM atomics remain rule-free; Mark 2 is a
**toggleable OpSet** (`src/opsets/mark2.mjs`).

### Vocabulary

**Do not redefine terms here.** Use
[`src/opsets/mark2.md`](../../prototypes/container-motion/src/opsets/mark2.md).

Breakout = Promote (node becomes sibling of its parent). Unary collapse is
the 1-child-CON settle rule, not another name for promote. Parent container
not “host.”

### Structural invariants (Mark 2 OpSet only)

1. Monitor children ∈ {0, 1}; second insert wraps under monitor.
2. Aspect for invent: taller→V, wider→H, **tie→`aspectTieBreak` (default HSPLIT)**.
3. No same-type CON nesting. Join under H → V (else TAB); under V → H (else TAB).
   If desired split equals a CON child, or unary promote would same-type vs new
   CON parent: **TABBED** (do **not** H↔V-flip — that undoes invent). Pref
   `defaultJoinContainer`: `SPLIT` \| `TAB`. Mins→TAB still later.
4. No unary CON (except monitor’s 0/1 child). Empty CON spacers = proto atomic escape only.
5. STACKED treated like TABBED for axis / join rules.
6. Shared monitors across workspaces: **DEFER**.
7. Mins in effect; fallback invent TAB, then locate join, then FLOAT.

### Directional move / join (leaves first)

- **v1 OpSet targets: WINDOW leaves only** — no CON join-move, no CON breakout yet.
- Move in-axis: reorder / edge **wrap** (pref = rotate item to other end;
  `H(A,B)` A← → `H(B,A)`). **Before** cross-mon — a parent with ≥2 children
  wraps in-place; cross-mon only when wrap cannot apply (sole child /
  edgeMove pop after edge / etc.).
- Move cross-axis: breakout (not past mon / mon sole child).
- Cross-mon move: when at true monitor edge (in-axis through ancestors) and
  no in-parent wrap applied.
- Join in-axis + sibling window: wrap both in new CON (different type).
- Join in-axis + sibling CON: **enter** CON (near end for dir).
- Join toward **cross-axis** sibling CON: **promote** that CON’s children into
  the parent and insert the leaf at the join boundary
  (`H(V(A,B),C,D)` Join← → `H(A,B,C,D)`).
- Join at edge / cross-axis: **breakout then join** in pressed direction (not
  bare breakout; unary cleanup before the follow-up join). Two-leaf wrap-pair
  on any dir only when breakout is impossible (mon sole-child CON).
- Join TAB siblings (for now): pull the two items out into a SPLIT beside the TAB in parent order — **not** nested TAB-in-TAB; nested tab chrome deferred.
- After OpSet ops: selection stays on the **moved leaf**.
- Two leaves under mon joining H→V (or V→H): outer unary dies → effective H/V swap.

### Post-op cleanup order (Mark 2)

After an OpSet invent/wrap/reparent:

1. **Choose / coerce type** of any new CON (opposite split; same-type → TAB;
   mins→TAB).
2. **Commit** tree links (children under new parent, parent in grandparent).
3. **Prune empty** CONs, then **collapse unary** (walk until stable).
4. **Re-coerce** if a promote created a new same-type pair.

(Atomics skip this pipeline.)

### Prefs (proto Settings)

| Pref | Default |
| --- | --- |
| Mark 2 policy enabled | on |
| `aspectTieBreak` | HSPLIT |
| `defaultJoinContainer` | SPLIT |
| edge move | wrap |
| peel model | B (legacy toggle) |

### Proto keybinds (Mark 2 extras)

| Chord | Action |
| --- | --- |
| `[` / `]` | Atomic cycle layout H→V→TAB→STACK |
| `m` | OpSet toggle split (H↔V; bag→allowed split) |
| `n` | OpSet toggle tab/stack (TAB↔STACK; H/V→TAB) |
| `{` / `}` | OpSet promote children / recursive |
| `e` | Equalize children |
| `u` / `Shift+u` | Unset size in-axis / cross-axis |

### Explicit divergences from 2026-08-06 (acknowledged)

Mark 2 **supersedes** edge-noop and explicit-only-join for the **prototype**.
Shell remains Mark 0 Move + Mark 1 C4 until adopt/abandon.

---

## Open decisions (remaining)

| ID | Question | Status |
| --- | --- | --- |
| D1 | Peel Model B | still lean **B** |
| D6 | CON+CON merge | deferred (no CON join-move yet) |
| D7 | Multi-select cyan | later |
| D11 | Shared monitors | **defer** |
| D12 | Empty CON in product | open |
| MD2 | Play Mark 2 in proto; adopt / revise / abandon for forge | **next** |

---

## HTML prototype (required before Shell motion changes)

**Goal:** Reason about motion **without** GNOME Shell. Keyboard-driven boxes.

### Acceptance for prototype

1. Single static page (vanilla HTML/JS/CSS) openable in a browser — e.g.
   `prototypes/container-motion/` (self-contained; not under `docs/` or `lib/`).
2. Render a mon as nested **boxes**: leaf units + CON frames labeled H/V/TAB/STACK.
3. Keys (configurable): focus leaf; elevate parent; clear; move L/R/U/D; peel/move-out;
   move-in; group; ungroup; optional tag cyan / commit merge.
4. Visual layers: focus, selection (magenta), merge tags (cyan).
5. Scenario presets: tall tab | term mon; nested H in V; two CONs side by side;
   peel until nested V in H.
6. On-screen log of tree ops (so we can paste into design locks).
7. Toggle switches for open decisions D1–D5 to A/B compare models live.

### Prototype tasks

| ID | Work | Status |
| --- | --- | --- |
| **MD0** | Write this plan + open decisions (this file) | **done** (draft) |
| **MD1** | Build HTML prototype + README how to open | **done** (`prototypes/container-motion/`) |
| **MD2** | Operator play session — lock D1–D9 in table | pending |
| **MD3** | Implement tasks spawned only after MD2 (peel B, edge no-op, …) | blocked on MD2 |

---

## Implement slices (after MD2 only — placeholders)

| ID | Work | Status |
| --- | --- | --- |
| **MI1** | Peel Model B in Tree move / command path; unit tests tall+wide bags under multi-child mon | blocked |
| **MI2** | Directional move: no edge auto-pop; sibling-only | blocked |
| **MI3** | Docs + cheatsheet alignment with selection S3 | blocked |

---

## Out of scope

- Implementing peel/move in Shell in this design pass  
- Browser tab DnD ([forge-tab-chrome-drag](./forge-tab-chrome-drag.md))  
- Workspace layout CLI ([forge-layout-workspace-scope](./forge-layout-workspace-scope.md))  
- Zoom / float groups  

---

## Agent recommendation (one paragraph)

Ship **workspace-scoped layouts** first (product fire). In parallel or next,
build the **HTML prototype** and lock D1–D9 with the operator. Default leans:
**peel B**, **no edge pop-out**, **explicit join/group**, **directional = sibling
geometry only**, multi-tag cyan as **v2** after sticky selection feels good.
Avoid encoding a–e into default hjkl. Nested CON-in-CON is fine; fear of
VSPLIT-in-VSPLIT should not block peel B.

---

## Handoff

1. Do not start MI* until MD2 locks the table.  
2. S3 kit binds can proceed on containers branch independently (discoverability).  
3. LX2 may remain until MI1 replaces pair-only reorient with wrap-in-slot.  
