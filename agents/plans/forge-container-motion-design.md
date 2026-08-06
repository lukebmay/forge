# Plan: Container motion, peel & join design

**Status:** design (discussion open — **no implement until locks + HTML prototype**)  
**Priority:** P1 design (after workspace-scope implement path; before more peel/move hacks)  
**Created:** 2026-08-06  
**Branch:** `plan/forge-container-motion-design` (docs + prototype only until locks)  
**Kind:** Product design → HTML prototype → then implement tasks  

### Session note (overwrite)

**2026-08-06:** Operator + agent discussion on peel model B, directional move
past siblings, join messiness, selection multi-target colors. **Do not code
tree motion** until design locks and interactive HTML prototype agree.
Related code today: LX2 peel reorient (incomplete for multi-sibling mon), C4
move-in/out + focus parent/child, S0–S2 selection sticky unit (containers branch).

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

## Open decisions (must close before implement)

| ID | Question | Options | Lean |
| --- | --- | --- | --- |
| D1 | Peel structure | A reparent vs **B wrap-in-slot** | **B** |
| D2 | Peel axis | aspect only vs direction+aspect | direction if any, else aspect |
| D3 | Move at sibling edge | no-op vs pop-out vs wrap | **no-op** |
| D4 | L/R U/D model | M1–M4 | **M2 + bag strip M4**; no M3 invent |
| D5 | Join invent | directional invent vs explicit group only | **explicit** |
| D6 | CON+CON merge | absorb rules vs new parent | **new parent** / multi-tag |
| D7 | Multi-select colors | S0 single only vs magenta+cyan set | prototype multi; S0 single until proven |
| D8 | Single-child CON | allow vs auto-collapse | **collapse** (existing auto-exit direction) |
| D9 | Normalize same-axis | never vs idle merge | never in v1 |

---

## HTML prototype (required before Shell motion changes)

**Goal:** Reason about motion **without** GNOME Shell. Keyboard-driven boxes.

### Acceptance for prototype

1. Single static page (vanilla HTML/JS/CSS) openable in a browser — e.g.
   `docs/dev/prototypes/container-motion.html` (or `temp/` until locked).
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
| **MD1** | Build HTML prototype + README how to open | pending |
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
