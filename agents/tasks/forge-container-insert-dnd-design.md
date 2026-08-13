# forge-container-insert-dnd-design — insert + Chrome-like DnD lock

**Status:** draft (awaiting operator pick)
**Plan:** [forge-container-motion-design](../plans/forge-container-motion-design.md)
  · [forge-tab-chrome-drag](../plans/forge-tab-chrome-drag.md)
  · [forge-first-class-containers](../plans/forge-first-class-containers.md)
**Branch:** master (docs only until lock)
**Blocker:** operator design pick — see below
**Updated:** 2026-08-13

## Goal

Lock **how new windows attach** and **how mouse drag reorders /
reparents** before more Shell motion patches. Operator: 3 Nautilus
windows sometimes land in an **even 3-way HSPLIT**; that should not
happen unless they manually resize. Drag should feel like **Chrome
tabs** (reorder in strip; drag out to peel / reparent / join).

## Do not implement tree motion until operator picks A/B/C

Existing lock: [container-motion-design](../plans/forge-container-motion-design.md)
says no Shell peel/move until MD2. This task adds the **insert**
question the 3-Nautilus report actually is.

## What the code does today (grounded)

`new-window-size-policy` default `preserve`, **but**
`insertChildPercent` (`lib/extension/tree-layout.js`):

> Until **any** sibling is `userSized`, new windows **always
> equalize**. After a user resize, `preserve` carves `1/(n+1)`.

So 3 Nautilus in one HSPLIT → even 1/3 each is **the current
contract**, not a fluke. `tree.split` only wraps the focused node
when the parent is not a single-child H/V. Opening into an existing
multi-child HSPLIT **appends a sibling** and equalizes.

DnD: 5-zone hit (`drop-zones.js`) — CENTER = TABBED via
`mergeWindowsIntoGroup`; edges = split. Empty-mon = leaf only
(R022). Tab-strip reorder (Chrome-in-strip) is still the deferred
[tab-chrome-drag](../plans/forge-tab-chrome-drag.md) plan (LX4
plumbing only).

Peel lean already in motion plan: **Model B** (wrap peeled leaf +
bag in a new CON in the bag’s old slot). Edge directional move:
**no auto-pop**.

## Choices for operator (pick one insert model)

### Insert (new window / same-app open)

| ID | Model | 3rd Nautilus | When is even 3-way allowed |
| --- | --- | --- | --- |
| **A** | **Slot-split (recommended)** | Always 50/50-split the **focused unit’s slot** (new CON `[focused, new]` if parent already has siblings). Never a 3rd even sibling of an existing H/V CON | Only explicit user resize of those siblings, or `window-reset-sizes` |
| **B** | Sibling + never auto-equalize | Still `H[A B C]` (i3-like), but percents never equalize on insert. New window takes 50% of the **focused sibling’s** percent | Only `window-reset-sizes` / user drag-resize to even |
| **C** | Same-app tab-first | Same `wm_class` joins focused window as TABBED. Different class uses A | 3 Nautilus = one tab group unless user splits |

**Recommend A.** Matches “even 3-way should never happen unless I
manually resize.” B still builds a 3-child HSPLIT (the structure the
operator is surprised by). C is a bigger product change and fights
side-by-side file managers.

### Drag (Chrome tab north star) — proposed lock, confirm

| Gesture | Result |
| --- | --- |
| Drag along tab strip / along H/V sibling row | **Reorder** in that parent; percents travel with nodes |
| Drag a tab out onto a tile CENTER | **Join** that group (`mergeWindowsIntoGroup`) |
| Drag a tab/window onto a tile edge | **Slot-split that target** (same as A) — do **not** append as even 3rd sibling of target’s parent |
| Drag onto empty monitor | Leaf-only (R022) |
| Peel from tab bag with no drop target | Model B wrap-in-slot |

Do **not** implement until insert A/B/C is picked. TD1 (strip
reorder only) may start after lock if A or B — it does not change
insert.

## Acceptance (after pick)

- [ ] Operator picks A / B / C (or a redesign)
- [ ] Drag table confirmed or edited
- [ ] Then spawn implement tasks (insert policy + TD1 reorder)

## Session note

**2026-08-13 code map (explore):** Default **auto-split off**. Empty
landscape MONITOR is already HSPLIT. Each open is a sibling of LFT;
nobody `userSized` → equalize → `MONITOR HSPLIT [A,B,C]` at 1/3.
**Contract, not a race.** Auto-split ON already slot-wraps the 3rd
(closer to A); 2nd on empty mon is still a MONITOR sibling toggle.

DnD: same-axis edge **does** sibling-reorder, but
`_executeDropOperation` **starts with `resetSiblingPercent` on dest
and source** — percents do not travel. Tab-chrome LX4 is live grab
into the **same 5-zone TILE hit**, not strip-index reorder. Matching
edge onto a 3-child parent appends a 4th sibling (opposite of A).
Empty-mon already R022 leaf-only. Keyboard `Tree.move` at mon edge
**pops to MONITOR** (fights motion-plan D3 no-auto-pop).

No same-app→TABBED open path (C is new product). Waiting on
operator A/B/C.
