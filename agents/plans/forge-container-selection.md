# Plan: Container selection, nesting & ops target

**Status:** design / discussion — **top priority** (human lock before more CON ops)
**Updated:** 2026-08-01  
**Branch:** discussion may start on `master` or stay on `plan/forge-first-class-containers`; implement slices open a branch after locks  
**Kind:** Product design → then implement tasks  
**Depends on:** [forge-first-class-containers.md](./forge-first-class-containers.md) C0–C5 + R1/R1b + R2 (spine done)

### Session note (overwrite)

Opened 2026-08-01 after primary container wave. Code has focus-parent/child +
move-in/out + layout cycle + group/ungroup, but **selection model** and
**nested tab/stack policy** are underspecified for daily use. Next session:
human design discussion → lock table → implement slices (not code first).

---

## Why this plan exists

The container **spine** is landed (structure-preserving layout, explicit group,
owning-split resize, chrome, focus parent/child, move-in/out). What still feels
incomplete is **who the next key acts on**:

| Pain | Today |
| --- | --- |
| Most ops assume a **WINDOW** focus | GNOME always focuses a real Meta window |
| “Select the container” is half-real | `focus-parent` sets attach/selection for open/split/move unit; chrome helps; kits mostly **unbound** |
| Nested CONs exist in the tree | Tab-in-tab / CON-in-TABBED chrome and move UX are awkward |
| Move tile vs move group | Easy to reparent the wrong unit |

Without locks here, implementers will keep bolting special cases onto window-focus.

---

## What already landed (do not re-litigate code existence)

| Capability | Status | Notes for live QA |
| --- | --- | --- |
| Layout mode cycle (H↔V, tab↔stack, absolute layout) | **Yes** — C1 `setLayout` I1 | Mode only; no silent flatten |
| Group / ungroup | **Yes** — C2 I2 | Merge → tabbed; ungroup one level |
| Split chrome ancestry / show-all | **Yes** — C3 | Focus ancestry default |
| Focus parent / child | **Yes** — C4 API | i3 kit: parent = `Super+a`; Safe/Vim **unbound** |
| Move-in / move-out | **Yes** — C4 API | **Unbound** all kits; CLI RunSteps exist |
| Tile move / swap directions | **Yes** (pre-C) | Window-level; not “selected CON as unit” everywhere |
| Owning-split resize (expand/edge keyboard) | **Yes** — R1/R1b | Pair cannibalization locked |
| Nested CON tree | **Yes** (engine) | Nested H/V common; nested TABBED less productized |
| Zoom | **No** — Z0+ | After selection model is honest |

Related locks already in containers plan: **pair-cannibalization**, I1–I3, group default tabbed.

---

## Human verification checklist (black)

Install debug build of `plan/forge-first-class-containers` (or merged master once merged). Logging on. Prefer i3 kit for parent focus, or bind unbound keys temporarily.

### A. Layout toggle / cycle (I1)

- [ ] H ↔ V on a multi-window split: same children, percents kept  
- [ ] Tab ↔ stack on a **group**: same children; chrome flips; no flatten nest  
- [ ] Absolute `layout` / `layout-cycle` CLI matches keyboard  
- [ ] Mode toggle does **not** dissolve CON (use ungroup for that)

### B. Group / ungroup (I2)

- [ ] Merge two windows → tabbed CON  
- [ ] Ungroup once → children to grandparent; nested child CONs remain  
- [ ] Second ungroup peels next level  
- [ ] Single-child tab with `auto-exit-tabbed`: mode→split, CON still exists until ungroup

### C. Tile movement (window)

- [ ] Directional **move** and **swap** still feel right in flat H/V  
- [ ] Move at edge of nest does not thrash Shell / wrong mon  
- [ ] After move, percents / userSized not silently wiped across whole mon

### D. Container enter / exit (C4)

- [ ] `focus-parent` (i3 `Super+a`): attach/selection on CON; open/split targets CON  
- [ ] `focus-child`: back into preferred child / lastTabFocus  
- [ ] `move-out`: window leaves CON; CON stays if siblings remain  
- [ ] After focus-parent, `move-out` lifts the **CON** (whole bag)  
- [ ] `move-in`: into adjacent sibling CON only; no-op if none (no invent)

### E. Nesting / “container enters container”

- [ ] H/V nest: split a pane, chrome ancestry readable  
- [ ] Move-in a window into a sibling tab group  
- [ ] Move-in a CON into another CON (if reachable) — note chrome + tab labels  
- [ ] Tabbed CON whose child is itself a CON (sub-group) — document pain  

### F. Resize after structure

- [ ] Edge grow fights **pair** only (not re-equalize all)  
- [ ] Group many, resize outer: interior shares scale proportionally  

### G. Kits / discoverability (product, not bugs)

- [ ] Safe/Vim: can you actually reach focus-parent without binding?  
- [ ] Cheatsheet shows Resize family (R2)  
- [ ] Unbound move-in/out/focus-child: intentional vs “dead feature”

---

## Design agenda (next session)

### 1. Selection model

**Problem:** Mutter focuses windows. Forge needs a first-class **ops target**:

| Mode | Meaning |
| --- | --- |
| **Window focus** | Default; Meta focus = window leaf |
| **Container selection** | Ops target is a CON (attach node); still need a “representative” window for GNOME raise/activate |

Questions:

1. Is **focus-parent** the only way to select a CON, or also click chrome / tab strip / hold mod?  
2. Does selection **persist** until explicit focus-child / window click, or clear on next focus-window?  
3. Visual: how do we show “CON selected” vs “window focused inside CON”? (border on bag? dim siblings? label?)  
4. Which ops use **unit** (window | selected CON) vs always leaf?  
   - move-in/out, resize, layout cycle, group/ungroup, open attach — matrix needed  
5. Should **layout unit** for resize (outermost tab/stack bag) stay automatic, or only when CON selected?

### 2. Nested groups (tab-in-tab, stack-in-tab, CON in TABBED)

**What nested tab groups would solve:**

| Benefit | Detail |
| --- | --- |
| Hierarchical workspaces-in-workspace | e.g. “Browser” bag with Grok | Chrome tabs-as-apps inside without flattening |
| Move/resize a **project bag** as one unit | Pair-cannibalization against outer split without equalizing interior |
| i3-like deep trees | Matches engine capability already |

**Problems:**

| Problem | Detail |
| --- | --- |
| **Ambiguous target** | Next key: leaf tab vs parent bag vs grandparent? |
| **Chrome density** | Nested tab strips eat space; GNOME apps hate chrome loss |
| **Focus parent depth** | Multiple `focus-parent` presses; easy to lose place |
| **Move-in target** | Adjacent sibling CON only today — invent vs wrap policies |
| **lastTabFocus** | Which level’s “active” leaf is raised? |
| **Session / layout profiles** | Sugar for nested tab bags is harder to read/edit |
| **DnD** | Center-drop invents tabbed; drop into nested bag needs drop-target rules |

**Not the only path:** nested **H/V** + single tab bag per “project” may be enough if selection is good. Nested TABBED is power-user / optional if chrome stays honest.

### 3. Container enters other containers (reparent)

Today:

- **move-in** → next (else prev) **sibling** CON; no invent  
- **move-out** → lift one level; not dissolve  
- **group/merge** invents structure  

Design choices:

| Choice | Tradeoff |
| --- | --- |
| Keep “sibling only” move-in | Predictable; weak for far targets |
| Directional move-in / “move into focused parent of neighbor” | More i3-like; harder |
| Wrap + move as one macro | Fewer keys; more magic |
| Drag whole bag only when CON selected | Needs selection model first |

### 4. Kit bindings

| Key | Safe / Vim | i3 | Product question |
| --- | --- | --- | --- |
| focus-parent | unbound | Super+a | Bind on Safe/Vim? |
| focus-child | unbound | unbound | Chord? |
| move-in / move-out | unbound | unbound | Chords or CLI-only until selection UX solid? |

Do **not** invent chords in this design pass without conflict scan.

### 5. Out of scope for this plan

- Zoom (Z0+) — after selection  
- yuiop / auto-tile  
- Floating groups (F)  
- Mouse resize residual (R1b leftover) — separate polish  

---

## Recommended product direction (draft — unlock with human)

1. **Selection first, nested tabs second.** Make CON selection visible and bind focus-parent/child on at least one daily kit before inventing tab-in-tab UX.  
2. **Ops target matrix** (lock table): each command lists target = leaf | layoutUnit | selection | parent.  
3. **Nested TABBED allowed by engine** but **not** promoted in sugar until chrome + selection pass live QA. Prefer nested H/V + one tab bag for daily profiles.  
4. **move-in stays sibling-only** until selection is trustworthy; then consider directional.  
5. **Visual language:** extend split chrome / focus border for “selected CON,” not a second decoration system.

---

## Phases (after locks)

| ID | Work | When |
| --- | --- | --- |
| **S0** | Design session: fill lock table below; kit binding shortlist | Human + agent notes |
| **S1** | Selection state machine + visuals (persist rules, representative window) | After S0 |
| **S2** | Ops target audit: wire move/layout/resize to matrix; unit tests | After S1 |
| **S3** | Kit bindings + docs/cheatsheet for selection ops | With S2 |
| **S4** | Nested tab/stack policy: allow / limit / sugar (only if S0 wants it) | Optional |
| **S5** | Live black QA of nested reparent + thrash | After S2–S3 |

---

## Lock table (fill in S0)

| Topic | Options | Decision | Date |
| --- | --- | --- | --- |
| CON selection persistence | until focus-child / window click / timeout | | |
| CON selection visual | bag border / chrome pulse / overlay label | | |
| focus-parent on Safe/Vim | bind / leave unbound / kit-only | | |
| move-in/out default chords | yes kit / CLI-only for now | | |
| Nested TABBED product | promote / allow silent / discourage | | |
| Ops target default for move | leaf only / layoutUnit bag / selection | | |
| Resize target | always layoutUnit bag (current) / selection-aware | | |

---

## Success metrics

1. User can select a CON, **know** it is selected, and move/resize/layout that unit without surprise leaf reparent.  
2. Nested H/V daily driver stays calm; nested tab bags either work or are explicitly out of product.  
3. Unbound C4 keys either get kits or are documented as advanced/CLI.  
4. No return of silent flatten / monocle-class “gather everything.”

---

## Related

| Doc | Role |
| --- | --- |
| [forge-first-class-containers.md](./forge-first-class-containers.md) | Spine C/R; pair resize locked |
| [docs/user/layouts.md](../../docs/user/layouts.md) | User-facing group/focus/move |
| [docs/DESIGN.md](../../docs/DESIGN.md) | Durable why |
| [forge-layout-settle-pure.md](./forge-layout-settle-pure.md) | Separate P1 settle jumpiness |

---

## First next session step

1. Read this plan + live checklist § human verification.  
2. Operator walks **A–G** on black (or subset); notes fail/surprise.  
3. Fill **Lock table** (S0).  
4. Only then open implement tasks S1+.
