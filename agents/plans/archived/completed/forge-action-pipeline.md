# Plan: Forge action pipeline

**Status:** **code complete** (AP0–AP4 + AP5 agent); soft op visual residual  
**Priority:** **P0** (highest)  
**Branch:** `plan/forge-action-pipeline` (merged → master locally)  
**Created:** 2026-08-06  
**Host:** black — dual 4K; prefer **X11 HUP**  

**Formulas:** [docs/dev/actions.md](../../docs/dev/actions.md)  
**Related:** [layout control loop](./forge-layout-control-loop.md) (CL0–CL11 on master), [DESIGN § Raise](../../docs/DESIGN.md)

---

## Session note (overwrite)

**2026-08-06 plan wrap (AP0–AP5 agent done):**
- AP1 `afterFocus` · AP2 one-commit · AP3 geom/open/RunSteps · AP4 command facade
- AP5: X11 install+HUP no SEGV; extension ACTIVE; 2219 tests; op visual =
  soft [B-ap5-operator-visual-matrix](../blockers/B-ap5-operator-visual-matrix.md)
- API: `afterFocus` / `commitLayout` / `settleTabFocus` in `action-pipeline.js`
- Later: mon-order X11 reverse task (not this plan)

---

## Problem

Layout control loop covers sensors/open (`requestLayout` → commit → verify). User
actions (focus, move, swap, tab click, DBus, drag) still hand-compose side effects:

| Defect | Example |
| --- | --- |
| Same step 2–3× | Tab click + Meta focus queue + optional command |
| Same goal, different steps | Move (double render) vs Swap (raise+F+render) |
| Full apply where chrome-only | Historical `renderTree("focus")`; global deco hide-all |
| Controller bypass | Commands bare `renderTree`; open uses `requestLayout` |

Patches like focus-no-reflow and focus-scoped decoration fix **one entry**. Without
a **formula per action class**, the next fix re-duplicates or misses siblings.

---

## Stages (only legal verbs)

| ID | Name | Effect | Meta geometry? |
| --- | --- | --- | --- |
| **M** | Mutate | Tree topology / percent / mode / lastTabFocus data | No |
| **C** | Commit | Full `renderTree` body (prune→floats→slots→apply→max→Dfull+B) + verify | Yes |
| **Cq** | Commit-queued | `requestLayout` → debounced **C** | Yes (later) |
| **Cf** | Commit-force | `renderTree(..., true)` | Yes (soon) |
| **F** | FocusChrome | Tab/stack: lastTabFocus + ε sibling reassert + raise leaf | Selective move |
| **Dfocus** | DecoFocus | Restack **one** group strip (`scope:"focus"`) | No |
| **Dfull** | DecoFull | Hide/show strips all eligible mons | No |
| **B** | Borders | Focus/split borders from **slot** | No |
| **P** | Pointer/LFT | `movePointerWith` + LFT touch | No |
| **A** | Attach | `tree.attachNode` | No |
| **V** | Verify | Meta↔slot (auto after C) | Read |
| **Z** | Freeze | Mutes apply mid-grab/batch | — |

### Composition rules

1. Focus never runs **C**.
2. Structure change ends in **exactly one C** (queued or force).
3. If **C** runs, do not also F+Dfocus unless post-commit settle of open leaf.
4. Geometry: forge/in-slot → **B only**; external → **Cq**+**V**.
5. Raise multi-path stays intentional (CA6 / DESIGN) — no mega `raiseWindow()`.

---

## Formulas (summary)

Full detail: [docs/dev/actions.md](../../docs/dev/actions.md).

| Class | Recipe |
| --- | --- |
| **FocusChanged** | Activate → **F** → **Dfocus** → **B** → **P** → **A** (via `afterFocus` only) |
| **StructureChanged** | **M** → one **C** → optional **settleTabFocus** → **P** if needed |
| **SizeOnlyChanged** | **M** → one **C** |
| **OpenApp** | Admit → quiet → **M** → **Cq** → **V** (batch: residual one **Cf**) |
| **ExternalGeometry** | B only \| live grab \| **Cq**+**V** |
| **Recovery** | **M** rehome/restore → **C** → raise settle |

---

## Target API

```text
wm.afterFocus(node, { source, forcePointer })   // F+Dfocus+B+P+A; idempotent
wm.commitLayout(reason, { force })              // Cq or Cf
wm.settleTabFocus(node)                         // F (+ Dfocus+B if strip buried)
```

Module: `lib/extension/action-pipeline.js` (or thin WM delegates).

---

## Tasks

| ID | Task | Status | Depends |
| --- | --- | --- | --- |
| **AP0** | Docs: this plan + `docs/dev/actions.md` + PRIORITY/HANDOFF | **done** | — |
| **AP1** | `afterFocus` + migrate Meta/tab/cmd/DBus focus; tests | **done** | AP0 |
| **AP2** | Structure one-commit (Move/Swap/drag); tests | **done** | AP1 |
| **AP3** | Geom/open/RunSteps formula alignment | **done** | AP1 |
| **AP4** | command.js → `commitLayout` facade | **done** | AP2 |
| **AP5** | Live X11 HUP smoke matrix | **agent done** (op visual residual) | AP2 |

### AP1 acceptance

1. All focus entries call `afterFocus` only (no inline F+D+B lists).
2. No `renderTree` on ordinary focus; no **Dfull** on focus.
3. Double-call idempotent; cross-mon no hide other strip.
4. Unit: WindowManager-focus + decoration scope tests green.
5. Optional: shorten 220ms focus queue to idle-0 if strip stays pickable.

### AP2 acceptance

1. Move/Swap/drag-end: **≤1** `renderTree` per gesture (unit spy).
2. Tab open leaf still correct after move in group.
3. No second `move-*-queue` full commit.

---

## Out of scope

- Unify all raise into one helper
- DecorationModel rewrite / flex sizing
- soft-rehome → monitor-recovery rename (MR0)
- Delete public `renderTree` (wrap via facade)

---

## Live test (AP5 / ongoing)

Operator on **X11** (agent HUP OK):

| Gesture | Expect |
| --- | --- |
| Click mon0 Ghostty | mon1 tabs no flash |
| Tab switch | raise + strip; no ¼ height |
| Focus keys | borders follow; no forest reflow |
| Move / swap / drag | one settle each |
| `forge layout dev` | open batch clean |

---

## Agent checklist (FIRM when touching focus/layout/chrome)

1. Which action class?
2. Belongs in a **stage** or one-off?
3. Update **all entries** of that class.
4. Reintroduce **C** or **Dfull** on focus? → stop.
5. Test the formula (spy stages), not only one entry.
