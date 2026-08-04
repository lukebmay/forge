# Plan: Container selection, nesting & ops target

**Status:** S0 locked · S1–**S2 done** — implement S3 next  
**Updated:** 2026-08-03  
**Branch:** `plan/forge-first-class-containers` (or new `plan/forge-container-selection` after containers merge)  
**Kind:** Product design → implement tasks  
**Depends on:** [forge-first-class-containers.md](./forge-first-class-containers.md) C0–C5 + R1/R1b + R2 (spine done)

### Session note (overwrite)

**Handoff 2026-08-04** — S2 still next product is **S3**, but **Wayland session first**.

- Branch: `plan/forge-first-class-containers` (thrash + lock-ownership commits; master not merged)
- Cross-session: [agents/HANDOFF.md](../HANDOFF.md) — Wayland thrash + selection smoke
- X11 selection smoke via RunSteps: elevate + layout-cycle TABBED↔STACKED OK; CLI swap not elevated
- **Next after Wayland:** S3 kit bindings (Vim Super+p + BackSpace clear multi-bind + cheatsheet)
- S2 completed: [completed/forge-container-selection_s2-ops-matrix.md](./forge-container-selection/completed/forge-container-selection_s2-ops-matrix.md)
- **Next task:** [forge-container-selection_s3-kit-bindings.md](../tasks/forge-container-selection_s3-kit-bindings.md)


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

## Locked product direction (S0 — 2026-08-03)

### One-sentence model

> **Focus is where you type; selection is what tiling ops move. Default
> selection follows focus; parent elevates it; clear restores the default.**

### Primary model: sticky unit selection (not mode-first)

| State | Ops target |
| --- | --- |
| **Default** | Focused window leaf |
| **After focus-parent** | Parent CON (multi-press walks up; stop at mon/ws) |
| **After focus-child** | Prefer child / lastTabFocus (may be nested CON) |
| **Clear** | Snap target back to focused window |

**No selection mode in v1** (no rebinding Super+hjkl). Optional later: select-mode
as a **navigator only** over the same sticky target — no confirm/lock-in step.

**No lock-in on exit** if mode is added later: cursor *is* selection; exit keeps
or clears by one rule only.

### Persistence / clear

| Trigger | Behavior |
| --- | --- |
| Explicit **clear** key | Target → focused window |
| **Meta focus** to another window | Target → that window (reset) |
| Timeout | **No** |
| Sticky bag while focusing leaves inside | **Not v1** |

### Visual: focus stays; selection is separate and loud

| Indicator | When | Style |
| --- | --- | --- |
| **Focus border** (user purple / `.window-tiled-border` etc.) | Always on focused Meta window | **Unchanged** — never replaced by selection |
| **Selection bag chrome** | Only when target is an elevated CON (target ≠ focus leaf) | **Distinct** class + color; full CON rect |
| Default (target = focus leaf) | Everyday | Focus only — **no double paint** |

**Do not** recolor the focus border to mean "parent selected." Two meanings, two
layers. Selection color must read at a glance as "ops unit," not "keyboard focus."

Default stock palette (themeable via CSS, same as other borders):

| Role | Suggested default | Notes |
| --- | --- | --- |
| Focus (tiled) | Existing red/user purple | Keep user CSS |
| Selection CON | **New** e.g. `.window-selection-border` — high contrast vs focus (stock: green/lime or strong amber distinct from split yellow) | User overrides in profile stylesheet |
| Optional depth | Slightly thicker border and/or dim non-selected siblings | Prefer border first; dim is polish |

Reuse decoration pipeline (St border actor on CON rect) — **not** a second overlay system.
New selector documented in theming + bundled `stylesheet.css`.

### Ops target matrix (v1)

| Op family | Default (leaf target) | Elevated CON target |
| --- | --- | --- |
| **Move / swap** directional | Focused window | **Whole CON** as unit |
| **Layout cycle / setLayout** | layoutUnit / parent as today | Selected CON |
| **Ungroup** | Nearest parent CON of focus | Selected CON if CON |
| **move-out / move-in** | Window unit (existing) | Selected CON (existing resolveMoveUnit) |
| **Open / split attach** | attachNode (selection) | Same |
| **Resize expand/edge** | **layoutUnit bag** (current automatic) until selection-aware polish | Prefer selected CON if elevated; else layoutUnit |
| **Focus hjkl** | Always Meta focus; resets selection | Never moves selection in v1 |

No automatic "tab bag is always move unit without parent press" in v1 (avoids
nested surprises). Explicit elevate only.

### Kit bindings

#### Constraint (Vim / operator)

- Prefer chords on the **right side of the keyboard**.
- **Avoid dual left-hand mods** (e.g. left Ctrl + left Super) — most boards have
  no right Super; left hand should not pin two modifiers for a frequent action.
- Prefer **`Super` + right-hand key** (same family as Vim focus Super+hjkl).

#### Chord shortlist (bind in S3; conflict-scan before ship)

| Action | Vim (preferred) | i3 | Safe |
| --- | --- | --- | --- |
| focus-parent | **`Super+p`** (p = parent, right hand) — *candidate* | keep **`Super+a`** | **`Ctrl+Super+p`** OK (Safe already multi-mod primary) or unbound until QA |
| focus-child | **`Super+n`** or **`Super+.`** — TBD conflict scan | unbound or pair | TBD |
| clear selection | **BackSpace family (multi-bind trial)** — see below | same set or subset | same idea under Safe multi-mod grammar |
| move-in / move-out | **Unbound** v1 (CLI ok) until chrome + clear feel solid | unbound | unbound |

**Clear selection — BackSpace family (try-out; lock one later):**

Ship **all** of these on Vim (and optionally i3) so the operator can feel which
fits; GSettings arrays allow multiple accelerators per action. Later S3/S5 trim
to one primary if desired.

| Chord | Notes |
| --- | --- |
| **`Super+BackSpace`** | Bare Super + right key; lightest |
| **`Shift+Super+BackSpace`** | Same hand family as Vim move (Shift+Super+hjkl) |
| **`Ctrl+Super+BackSpace`** | Same family as Vim swap (Ctrl+Super+hjkl) |
| **`Ctrl+Shift+Super+BackSpace`** | Full twin; heaviest, least accidental |

No need to pick a winner in S0 — **product lock after live use**.

**Rejected for Vim parent:** `Ctrl+Super+p` (dual left mods).  
**Rejected for Vim parent:** `Shift+Super+p` (Shift family = move, wrong mnemonic).  
**Rejected for clear:** `Super+Escape` (awkward reach; Esc = cancel-mode muscle).  
**Rejected for clear:** `Ctrl+Super+Return` / Enter family (crowded; Super+Return stays swap-last on Vim).  
**Do not steal for clear:** `Super+Return` — Vim = **swap last active** today; leave free for future zoom/maximize stories on other kits (`Super+m` already reserved for zoom full).

**Why BackSpace for clear:** “back out” of elevated selection → default focus unit;
semantic fit > Enter. Modifier variants exist only to find a comfortable chord.

Bare `Super+p` / bare `Super+BackSpace` acceptable on **Vim kit only** (power map
already uses bare Super); Safe uses multi-mod variants if bound. Conflict scan at
S3 (GNOME / other Super+BackSpace users).

### Nested TABBED

| Decision | Detail |
| --- | --- |
| Engine | Allow (already) |
| Product / sugar | **Discourage / do not promote** until selection chrome + move unit pass live QA |
| Daily profiles | Nested **H/V** + **one** tab bag preferred |

### move-in policy

Sibling-only until selection trustworthy; no invent. Revisit after S2–S5.

### Selection mode (deferred)

Optional v2 navigator only if sticky parent/child fails live QA. Same sticky
target underneath; focus chords move cursor only while mode active; Esc exits
keeping target; clear still resets. Not in S1–S3 scope.

---

## Phases

| ID | Work | Status |
| --- | --- | --- |
| **S0** | Design locks (this section) | **Done** 2026-08-03 |
| **S1** | Selection state machine + **loud** bag chrome (CSS class, theme docs) | **Done** 2026-08-03 |
| **S2** | Ops matrix: move/swap/layout/ungroup honor elevated target; unit tests | **Done** 2026-08-03 |
| **S3** | Kit bindings (Vim right-hand Super+…; i3 Super+a; clear) + cheatsheet/docs | **Next** |
| **S4** | Nested tab/stack product policy (only if needed) | Optional |
| **S5** | Live black QA (checklist A–G + selection elevate/move/clear) | After S2–S3 |

---

## Lock table (S0 filled)

| Topic | Decision | Date |
| --- | --- | --- |
| Primary model | Sticky unit selection; **not** mode-first | 2026-08-03 |
| CON selection persistence | Until clear key or Meta focus change; no timeout | 2026-08-03 |
| CON selection visual | **Separate** bag border (new CSS class); focus purple/red **always remains** | 2026-08-03 |
| focus-parent Vim | Bind Super+right-hand (**`Super+p` candidate**); no dual left mods | 2026-08-03 |
| focus-parent i3 | Keep `Super+a` | 2026-08-03 |
| focus-parent Safe | Optional `Ctrl+Super+p` or unbound until QA | 2026-08-03 |
| clear selection | Explicit key + focus change resets; Vim **BackSpace family** multi-bind (Super / Shift+Super / Ctrl+Super / Ctrl+Shift+Super) — lock one after live | 2026-08-03 |
| move-in/out default chords | CLI / unbound v1 | 2026-08-03 |
| Nested TABBED product | Allow silent; **discourage** promote | 2026-08-03 |
| Ops target for move/swap | Elevated **selection** CON; else leaf | 2026-08-03 |
| Resize target | layoutUnit default; selection-aware when elevated | 2026-08-03 |
| Selection mode | Deferred v2 | 2026-08-03 |

---

## Success metrics

1. User can select a CON, **know** it is selected (distinct chrome + focus still visible), and move/swap that unit without surprise leaf reparent.  
2. Clear and focus-change return to "focus is selection" with no sticky confusion.  
3. Nested H/V daily driver stays calm; nested tab bags either work or stay unpromoted.  
4. Vim parent/clear usable without dual left-hand modifier chords.  
5. No return of silent flatten / monocle-class "gather everything."

---

## Related

| Doc | Role |
| --- | --- |
| [forge-first-class-containers.md](./forge-first-class-containers.md) | Spine C/R; pair resize locked |
| [docs/user/layouts.md](../../docs/user/layouts.md) | User-facing group/focus/move |
| [docs/user/theming.md](../../docs/user/theming.md) | CSS selectors (add selection border) |
| [docs/DESIGN.md](../../docs/DESIGN.md) | Durable why |
| [forge-layout-settle-pure.md](./forge-layout-settle-pure.md) | Separate P1 settle jumpiness |

---

## First next session step

1. Implement **S3** — Vim `Super+p` + BackSpace clear multi-bind + cheatsheet/docs.  
2. Operator live QA checklist A–G + elevate → move bag → clear (S5).  
3. Soft: containers → master merge after smoke.

### Soft leftovers (do **not** block S3)

| Item | When |
| --- | --- |
| focus-child exact chord (`Super+n` vs `.`) | S3 conflict scan |
| Which BackSpace clear chord “wins” | After live try-out |
| Safe parent bind | Optional / S3 |
| Containers → master merge | When operator smoke OK (spine already done) |
| Wake mon thrash harden | Separate plan; not selection |
