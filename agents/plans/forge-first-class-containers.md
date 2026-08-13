# Plan: First-class containers (zoom & float later)

**Status:** discussion locked enough to implement — **container-first**  
**Updated:** 2026-07-31  
**Branch:** `plan/forge-first-class-containers` (create on first code task)  
**Kind:** Core product architecture → phased implement  
**Compatibility:** **No backwards-compat obligation.** Prefer clean breaks over
shims. May diverge hard from classic Forge surface if that yields a simpler core.

### Session note (overwrite)

**2026-08-13:** Operator pulled **Wave Z forward** (Vim maximize chords +
axis zoom + zoomed border). IC3/D026 is in tree — Z0/Z1 may start:
[forge-zoom-maximize](../tasks/forge-zoom-maximize.md). Wave C still
paused behind [container insert lock](../tasks/forge-container-insert-dnd-design.md)
(3-way even HSPLIT / Chrome-tab DnD). Do not start C0 peel/move until
that pick.

User lock + i3 research (2026-07-31): containers first; no BC; monocle
**remove**; split chrome focus-only + show-all + drag show-all; resize
interleaved; float+placeholder zoom rejected. Added **i3 lessons** and
**deferred regression registry**. Implementation branch still starts at first
code task (after contracts).

---

## Product stance

| Stance | Decision |
| --- | --- |
| **Identity** | Still a GNOME tiling tree WM — but product surface may become “a different Forge.” OK. |
| **Rewrite whole extension?** | **No.** Tree + CON + four layouts is already the right core. Rewrite **ops, chrome, resize, and lossy paths** — not a greenfield shell. |
| **BC / migration** | **None required.** Delete monocle, rename keys, break layout toggles, drop dead tests. |
| **Order** | **Containers (+ resize) → then zoom → then floating groups.** Zoom/float decisions deferred until container model is honest. |
| **Clean as you go** | Every slice removes dead code and **purposeful** tests only (invariants users/devs rely on). No tests-for-coverage. |
| **Regressions** | Track intentional surface loss in **Deferred regressions** below; restore after core footing, not mid-refactor. |

---

## Lessons from i3

Research sources: [i3 User’s Guide](https://i3wm.org/docs/userguide.html)
(tree, layout, fullscreen, focus parent/child, resize, floating, indicators),
[Hacking howto](https://i3wm.org/docs/hacking-howto.html) (Con tree).

### Is i3 a good design?

**Yes as the architecture reference — with known UX taxes.**

i3 already walked the path Forge is finishing:

| i3 idea | Verdict for us |
| --- | --- |
| **Everything is a Container in a tree** (outputs → workspaces → cons → windows) | **Adopt.** Forge’s tree is the same shape. i3 *abandoned* workspace tables because they were harder to implement and understand — do not regress to flat grids. |
| **Layout is a property of the container** (`splith`/`splitv`/`tabbed`/`stacking`) | **Adopt.** Matches our four layouts. |
| **`layout toggle split` / `layout toggle all`** | **Adopt.** Mode change without reparenting is the non-destructive cycle we want. |
| **`fullscreen toggle` on the current window** (optional `global`) | **Adopt for Wave Z.** Tree slot stays; presentation changes. Validates killing monocle. i3 does **not** rebuild the workspace into one tab bag for peek. |
| **`focus parent` / `focus child`** | **Adopt (C4-ish).** Essential once containers are real; without it, users cannot target “the right split” for open/move/resize. i3 default `$mod+a`. |
| **Split direction indicator** (focused client’s right/bottom edge painted with *indicator* color = where the next window opens) | **Already half here** (Forge split/focus borders). Extend for H/V group chrome, not a second system. |
| **Resize grow/shrink direction + ppt** (percent points) and border drag | **Align R1.** Owning-split percent math is i3-like; we can improve ancestor walk clarity. |
| **Floating** as mode; floating windows above tiles; scratchpad | **Partial.** Keep float-on-node; scratchpad out of scope. Floating **groups** = later F (i3 has `floating_con` but no rich nested float bags). |
| **Layout restore placeholders** (`client.placeholder`) | **Not for zoom.** i3 uses blanks when *restoring saved layouts* with missing apps — different problem than temporary zoom. Reinforces: placeholders are for absences, not live peek. |
| **Gaps as CSS padding/margin metaphor** | Nice docs analogy; we already have gaps. |

### i3 flaws we can fix at this stage

| i3 pain | What happens | Our stance |
| --- | --- | --- |
| **Implicit containers** | Move/split can invent intermediate CONs; tab titles show `H[a b]` — structure surprises users | Prefer **explicit group**; minimize silent CON creation; when implicit is required, make chrome honest |
| **Structure hard to see** | Titlebars help; pure pixel borders less so | **Focus-ancestry split chrome** + show-all + drag show-all (locked) |
| **Deep trees without focus parent** | Focus/move feels random across nests | Ship **focus parent/child** with container work, not as polish |
| **No axis zoom** | Only full (or global) fullscreen | Wave Z: full **and** full-height / full-width |
| **New windows always attach to focused leaf** | Easy to deepen the tree accidentally | Keep LFT/policy; prefer attach-to-focused-**unit** (bag or leaf) once units are solid |
| **Monocle-as-tab-all** (not i3 core; Forge/i3-kit habit) | Destroys nest | **Delete monocle**; real fullscreen/zoom later |
| **Floating always-on-top, no nested float groups** | Fine for dialogs; weak for “float this tab group” | Design F after C; do not paper over with float+placeholder zoom |

### What we should *not* copy blindly

| Skip / de-emphasize | Why |
| --- | --- |
| i3 **binding modes** (resize mode, etc.) | Optional later; GNOME + kits already multi-mod |
| Full **i3 IPC command language** | We have DBus/CLI; parity of *ops*, not syntax |
| Mandatory titlebars on splits | GNOME apps hate chrome loss; borders + indicators better fit |
| Workspace-as-only-root mental model | We have MONITOR under WORKSPACE (multi-mon GNOME) — keep that |

### Net for this plan

i3 proves the **container tree + layout modes + non-destructive fullscreen**
design is sound. Forge’s thrash comes from **incomplete productization**
(lossy toggles, invisible H/V, monocle flatten), not from picking the wrong
architecture. We improve on i3 where it is weak: **visible structure, explicit
group/ungroup, axis zoom, less implicit CON magic.**

---

## Deferred regressions (intentional surface loss)

Features, chords, and behaviors we **remove or break** during the core
container/resize rewrite so the spine stays simple. **Track here → restore in
a later wave** once invariants hold. Do **not** re-add mid-C “for muscle
memory.”

### How to use this table

| Column | Meaning |
| --- | --- |
| **ID** | Stable id for tasks/commits (`REG-…`) |
| **Drop when** | Wave that removes it |
| **Restore when** | Earliest wave allowed to bring it back |
| **Notes** | Replacement or kit impact |

Update rows when a slice actually drops or restores something.

### Registry

| ID | Surface | Drop when | Restore when | Notes |
| --- | --- | --- | --- | --- |
| **REG-monocle** | `workspace-monocle-toggle` + `toggleWorkspaceMonocle` + docs | **C0** | **Z** (only if still wanted; prefer zoom full) | Structure-destroying tab-all. **i3 kit `Super+m`** unbound until restore. |
| **REG-i3-super-m** | i3 kit chord `<Super>m` → monocle | **C0** | **Z** (map to zoom full) | Explicit kit regression; document in kit changelog. |
| **REG-i3-super-f** | i3 kit `<Super>f` → **snap center** (not fullscreen) | optional C5/Z | **Z** map to zoom full | i3 users expect fullscreen; current mapping is already non-i3. Fix when zoom lands, not with monocle. |
| **REG-lossy-tab-toggle** | Tab/stack ↔ split paths that flatten nested CONs / hard-reset percents as side effect | **C1** | never as silent behavior; percent policy explicit | Replacement: non-destructive `setLayout` + explicit ungroup. |
| **REG-auto-exit-tabbed** | `auto-exit-tabbed` dissolving single-child tab CONs | **C1–C2** evaluate | optional later | Implicit structure change; may keep if it only flattens *empty* chrome, not user groups. Decide in C1 inventory. |
| **REG-ensure-flatten** | Layout ensure / thrash paths that collapse nested H/V into tab bags | **C0–C5** inventory; strip where not required for profiles | only as explicit `forge layout` repair flag | Profile apply may still reshape; user toggles must not. |
| **REG-expand-dual-axis** | Current `[`/`]` grow both axes via child+parent without clear docs | **R1–R2** | **R2** as documented Size step | Not deleted forever — re-specified as dual owning-split steps. |
| **REG-snap-as-fullscreen-ish** | Teaching snap-center as “fullscreen-ish” (docs/kits) | **Z** | n/a | Snaps stay as snaps; zoom owns peek. |
| **REG-golden-ratio** | `window-golden-ratio` (already unbound) | keep unbound through C | **R3** optional | Low priority ratio preset. |
| **REG-ratio-yuiop** | Proposed yuiop ratio keys | never ship in C | [resize-autotile](./forge-resize-and-autotile.md) optional | Not a regression of existing product; parked. |
| **REG-focus-parent** | *(missing today — not a regression)* | — | **C4** add | Listed so we don’t ship C without a restore path for tree navigation. |

### Kit / chord impact summary (at C0)

| Kit | Chord | Today | After C0 |
| --- | --- | --- | --- |
| i3 | `Super+m` | monocle | **unbound** (REG-i3-super-m) |
| i3 | `Super+f` | snap center | unchanged until Z (then prefer zoom) |
| Safe / Vim | monocle | unbound | stays unbound |
| All | monocle command | exists | **removed** |

### Restore policy (FIRM for implementers)

1. **Do not** reintroduce REG-* mid-wave to fix muscle memory.  
2. Restoring requires: core invariant green (I1–I3), a task id, and a one-line
   note in this table’s **Restore when**.  
3. Prefer **better replacement** (zoom vs monocle) over exact old behavior.  
4. When restoring a kit chord, update `keybind-presets.js` + user keybindings
   docs in the same change.

---

## Locked decisions

### 1. Phase order (dev-easiest path)

```text
C0 inventory + kill monocle (REG-*) + setLayout spine
  → C1 non-destructive layout transitions (i3-like layout toggle)
  → R1 owning-split resize (same milestone wave as C1–C2)
  → C2 group / ungroup (explicit; minimize i3-style implicit CONs)
  → C3 split chrome (focus ancestry + toggles; i3 indicator language)
  → C4 move into/out of group + focus parent/child (i3 $mod+a class)
  → C5 kit/docs/CLI polish; update REG table; delete residual lossy paths
  → Z* zoom ≈ i3 fullscreen + axis modes (map Super+m/+f when ready)
  → F* floating groups (beyond i3 floating_con)
```

**Why this order (dev view):**

1. **Non-destructive `setLayout` + explicit flatten** is the spine everything
   else hangs on (chrome, resize targets, zoom unit, float bag).
2. **Owning-split resize** is the same mental model as “container is a unit” —
   doing it *with* containers avoids teaching two resize worlds then rewriting.
3. **Chrome** after structure ops exist so indicators reflect real CONs, not
   ghosts of old toggles.
4. **Zoom last among tile features** so zoom’s unit = the same unit group/resize
   already use. Designing zoom *now*, implementing *after*.

### 2. Monocle — **remove**

| Choice | **Delete workspace monocle** as a structure-mutating feature |
| --- | --- |
| Why | It gathers all leaves into one tab CON — the opposite of first-class nest-preserving ops. Unbound on Safe/Vim; i3 kit maps `Super+m`. |
| Replacement | Later **zoom full** covers “peek one unit.” Workspace “one at a time” is zoom or tab, not a secret flatten. |
| Cleanup | Drop `toggleWorkspaceMonocle`, command, keybind, i3 `Super+m` mapping, docs; free chord for zoom later. Tests that only exist for monocle: delete or rewrite to group/zoom invariants. |

### 3. Split chrome

| Mode | Behavior |
| --- | --- |
| **Default** | **Focus ancestry only** — chrome on focused unit’s parent chain (split marks + existing focus/split borders as refined) |
| **Show all** | Setting / toggle: draw H/V indicators on every split CON |
| **While dragging** | **Force show-all** for drag duration (then restore prior mode) |

**What you already see:** the blue line with curved ends on the active window is
almost certainly the **focus border** + **split direction hint**
(`.window-tiled-border` / `.window-split-border`, `focus-border-toggle`,
`split-border-toggle`, `focus-border-radius`). That vocabulary is the right
**visual language** for H/V group indicators — extend it (e.g. which edge =
parent split axis, nest depth cue), don’t invent a second chrome system.

### 4. Resize — **fold into this plan, interleave**

| Decision | **Yes — same plan, interleaved with C** |
| --- | --- |
| Structural resize (owning split / edge → ancestor) | **In scope now** — required for “container is unit” |
| Prefs/cheatsheet Size vs Resize naming + order | **In scope** with R slices |
| Ratio-step yuiop / auto-tile algorithms | **Defer** — stay optional under [forge-resize-and-autotile](./forge-resize-and-autotile.md) or later R-optional; not on critical path |

**Owning-split rule (locked):**

```text
resize(edge):
  unit = focused layout unit (window, or tab/stack bag if inside)
  axis = axis of edge
  target = lowest ancestor of unit that is H/V split on `axis` and has a tiled pair
  if no target: no-op
  else: adjust target percent vs pair; userSized; normalize
```

Keyboard edge resize, mouse edge drag, and grow/shrink must share this resolver
(grow/shrink may still step both axes by applying the rule twice).

### 5. Zoom — design now, build later

#### Float + blank placeholder — **shot down as primary**

| Idea | Convert zoomed window to **float**, leave a **blank placeholder** in the tree |
| --- | --- |
| Appeal | Slot “stays put”; float already has raise/stacking paths |
| Why not primary | Double bookkeeping: ghost node vs real Meta window; session snapshot / thrash / soft-rehome must understand placeholders; decorations on empty slots; re-tile races (`processFloats` every render); multi-mon; zoom height/width are awkward as full float; cleanup bugs become “phantom tiles.” It’s sugar that fights the tree. |
| Keep as insight | Zoom must **preserve a slot without reparenting**. That’s a **presentation / apply skip** (or reserved percent), not a fake window. |

#### Preferred zoom (when Z lands)

| Mode | Meaning |
| --- | --- |
| Zoom full / height / width | Flag on layout unit; `apply` gives zoom rect; siblings keep percents, skip or underpaint |
| Unit | Same as resize: bag if tab/stack focus, else window |
| Not monocle | Never reparent all leaves |
| Not Meta-first | Pure Forge rect unless a later spike proves Meta fullscreen is cleaner |

Exact chords and CLI: **decide at Z0** after containers ship.

### 6. Floating groups — design constraint only until F

- CON remains the grouping unit; float remains a **mode** (today: window node).
- Future F: either float mode on CON (children float as a bag) or a floating
  root — **spike after C + Z**, not before.
- Do not invent float-group APIs during C except leaving hooks (e.g. unit
  abstraction that isn’t `isWindow()`-only).

---

## Core model (target)

```
ROOT → WORKSPACE → MONITOR → CON(layout) → WINDOW | CON
layout ∈ { HSPLIT, VSPLIT, TABBED, STACKED }
```

| Invariant | Rule |
| --- | --- |
| **I1** | `setLayout(con, L)` never reparents/flattens children |
| **I2** | Flatten/ungroup is **explicit** only |
| **I3** | Resize mutates percent of the **owning split unit**, not vacuum pixels |
| **I4** | Zoom (later) does not reparent; forest fingerprint stable aside from zoom flag |
| **I5** | Indicators reflect real CON layout; H/V visible under focus ancestry (or show-all) |

### Commands (target surface)

| Op | Role |
| --- | --- |
| `group` | Wrap units in new CON (default tabbed) |
| `ungroup` | Explicit flatten parent CON |
| `layout` / cycle split / cycle group / cycle-all | Mode change only (I1) |
| `move-in` / `move-out` | Reparent unit |
| `resize` / `grow` / `size` | Owning-split percent |
| `zoom` (later) | Presentation flag |
| ~~monocle~~ | **Removed** |

---

## Implementation phases

### Wave C — Containers (primary)

| ID | Work | Done when | Clean / tests |
| --- | --- | --- | --- |
| **C0** | Inventory lossy paths; **delete monocle** (REG-monocle, REG-i3-super-m); sketch `setLayout` + unit helpers | Monocle gone; REG table updated; flatten call-site list | Delete monocle-only tests; no BC shims |
| **C1** | Non-destructive layout transitions (H/V/tab/stack) — i3 `layout toggle` class | Cycle keeps child node identity | **Test I1** |
| **C2** | Explicit `group` / `ungroup` + CLI/RunSteps; cut silent CON invent where safe | Ungroup only dissolves CON | **Test I2** |
| **C3** | Split chrome: focus ancestry; show-all; drag show-all (i3 indicator language) | Visible H vs V under focus | Manual/live; pure helpers tested if extracted |
| **C4** | Move into/out of group + **focus parent/child** | Tree navigation without debug overlay | Test focus target + reparent ids |
| **C5** | Kits, docs, DESIGN; REG restore notes; strip residual lossy toggles | Docs + kits match; REG table current | Docs + smoke |

### Wave R — Resize (interleaved with C1–C3)

| ID | Work | Done when | Clean / tests |
| --- | --- | --- | --- |
| **R1** | Single owning-split resolver; wire keyboard + mouse | Nested off-axis edge resizes ancestor | **Test I3** (tree percent math pure) |
| **R2** | Prefs/cheatsheet: Resize vs Size; shrink/grow order | Sane grouping | No empty snapshot tests |
| **R3** (optional later) | Ratio-step / yuiop | Only if still wanted | See resize-autotile plan |

**Interleave:** ship R1 in the same stretch as C1–C2 (resolver needs stable units).
R2 can ride C5 docs pass.

### Wave Z — Zoom (after C wave stable; i3 fullscreen class)

| ID | Work |
| --- | --- |
| **Z0** | Lock chords, full/height/width, CLI; restore REG-i3-super-m / consider REG-i3-super-f |
| **Z1** | Zoom flag + apply path (not float placeholder; not monocle) |
| **Z2** | Kits + live black |

### Wave F — Floating groups (after Z or spike-only)

| ID | Work |
| --- | --- |
| **F0** | Design spike: CON float mode vs float root |
| **F1** | Implement only if spike is clean |

---

## Related plans

| Plan | Action |
| --- | --- |
| [DESIGN.md reshape phases](../../docs/DESIGN.md) | This plan **is** Phase 2–3 + zoom; update DESIGN when C ships |
| [forge-resize-and-autotile](./forge-resize-and-autotile.md) | Structural resize → **here**. Ratio/auto-tile remain discussion/optional |
| [forge-stacked-layouts](./forge-stacked-layouts.md) | STACKED chrome lessons; no conflict |
| Monocle docs in user layouts | Remove in C0/C5 |

---

## What we are *not* doing

- Float + placeholder as zoom architecture  
- Preserving monocle behavior for compat  
- Big-bang rewrite of extension.js / dropping the tree  
- Auto-tile algorithms in the critical path  
- Tests that only assert implementation trivia  
- Implementing zoom/float before container spine  

---

## Success metrics

1. Layout cycle H→V→tab→stack→H keeps the same child set (I1).  
2. Only `ungroup` (and intentional script ensure) dissolves a CON (I2).  
3. Off-axis edge resize changes the correct ancestor percent (I3).  
4. Focused nest is readable via split chrome without debug overlay.  
5. Code size of layout/resize special cases **drops** as lossy paths die.  
6. After Z: zoom off restores forest + percents (I4).

---

## First implement task (when coding starts)

1. Create branch `plan/forge-first-class-containers` (from up-to-date `master`).  
2. Task **C0**: monocle removal + REG table checkboxes + lossy-path inventory +
   unit helper sketch.  
3. Then **C1 + R1** as the first “real” behavior slices (A/B taskforce).  

No human blocker required for C0–C1 given locks above; open blockers only if a
product call reappears (e.g. default group layout for `group`).

**This plan commit may land on `master` (docs only).** Code work is always on
`plan/forge-first-class-containers`.

---

## Open only if reopened later

| Topic | Default if reopened |
| --- | --- |
| Default `group` layout | **tabbed** (product default today) |
| Zoom vs Meta fullscreen | Pure Forge rect (i3-like presentation) |
| Height/width relative to | Monitor workarea |
| Super+m after monocle death | **Zoom full** at Z (REG-i3-super-m) |
| Super+f in i3 kit | Prefer zoom full over snap center at Z (REG-i3-super-f) |
