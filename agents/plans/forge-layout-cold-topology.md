# Plan: cold layout topology (one-shot, no Mode B patch-over)

**Status:** active — CT1 code done; **CT2/CT3 live next**  
**Priority:** P0 (daily driver cold `forge layout dev`)  
**Branch:** `plan/forge-layout-cold-topology`  
**Depends on:** apply-contract AC1–AC6 (done); thrash-zero Mode A/B (done, **not** the fix here)  
**Related:** [forge-layout-apply-contract.md](./forge-layout-apply-contract.md), [forge-workon-thrash-zero](./forge-workon-thrash-zero/) (historical)

---

## Problem (what we are *not* solving)

Apply-contract fixed **settle thrash**: forest fighting Meta residual geometry, verify reassert wars, fingerprint quiet as settle.

That is **not** cold open failure. Cold open is:

```text
apps map → often wrong mon / flat tree
plan Mode B → partial place
operator runs layout again → roles OK
```

Mode B as a **second-pass recover** is a patch over wrong construction order. Product requirement: **one** `forge layout <name>` builds the intended topology without thrash recovery mid-flight.

---

## Architectural thesis (locked for design task)

1. **Desired topology is pure data.** Profile → target forest (slots, splits, tab groups, role→slot). No Meta required to *define* it.

2. **Binding windows to roles can wait on map** (async admissible place). Binding is not “tree shape.”

3. **Structural skeleton must be committed before parallel place races.**  
   You cannot reliably form mon0 `TABBED(chrome,Grok)|ghostty` while Meta is still dumping new maps onto mon1 and the plan is also Mode-B parking.  
   Agree with operator: **do not correct thrash while other layout operations are still in flight.**

4. **Mode B thrash-recover stays for true chaos** (user-scrambled desk mid-session), not as the cold-path default.

5. **No multi-CLI second pass** as the product fix. Internal multi-phase **within one command** is OK only if phases are ordered: *structure → bind → size → focus*, never *place while replan thrash*.

---

## Target cold path (sketch for design lock)

```text
Phase 0  Resolve profile + live candidates (class/title). Do not thrash-detect yet.
Phase 1  Build target skeleton (pure): mon children, empty tab CONs, slot ids.
Phase 2  Launch missing roles (parallel). Do not Mode-B mid-launch.
Phase 3  When each role window is admissible: bind to skeleton slot only
         (move into pre-created group / mon unit). No competing structure rewrite.
Phase 4  Order + size + focus once bindings complete (or per-slot when full).
Phase 5  Residuals: close/park **after** skeleton is bound — not interleaved with bind.
```

**Thrash detection** runs **after** phase 4 (or only when nothing is mid-batch), not as a concurrent recover loop.

Open design choices (task 0 must lock):

| Choice | Options |
| --- | --- |
| Skeleton in extension vs CLI-only path math | Prefer extension ops that create empty CONs / ensure mon split **before** maps |
| Empty tab CON before windows exist | Need first real window to materialize TABBED, or placeholder? |
| Wrong-mon map before bind | Suppress entered-monitor rehome during layout batch (already partial) |
| Idempotent re-run | Same skeleton; rebind only |

---

## Non-goals

- Second `forge layout dev` as success criteria  
- Login/session display remapping (gdisplays / shellrc)  
- Re-opening settle thrash wars (AC1–AC6 stand)  
- Guake float rehome (reverted; separate)

---

## Daily drivers

| Session | Role |
| --- | --- |
| **Wayland** | Primary on `black` |
| **X11** | Daily driver on older machines + testing — **CT3 required**, not optional |

---

## Tasks

| ID | Task | Status |
| --- | --- | --- |
| **CT0** | [Design lock](./completed/forge-layout-cold-topology_ct0-design.md) | **done** (approved) |
| **CT1** | [Skeleton-first implement](./completed/forge-layout-cold-topology_ct1-skeleton.md) | **done** (unit/code; A/B AGREE) |
| **CT2** | [Wayland live one-shot](../tasks/forge-layout-cold-topology_ct2-wayland-live.md) | **ready** (next; operator live) |
| **CT3** | [X11 live one-shot](../tasks/forge-layout-cold-topology_ct3-x11-live.md) | ready (after CT1; parallel CT2) |

---

## Acceptance (plan-level)

- [ ] Cold desk → single `forge layout dev` → correct dual-mon tabs **without Mode B** on Wayland (CT2) and X11 (CT3)  
- [ ] Settled re-run idempotent  
- [x] No thrash-recover interleaved with open/bind *(CT1 unit)*  
- [x] Unit tests for phase order; no “plan twice” as success *(CT1)*  
- [x] docs/user/layout.md cold section updated *(CT1)*  

---

## CT0 design lock (2026-08-08)

**Status:** **approved 2026-08-08** (human) — CT1 implement unlocked  
**Grounded in:** current `_layout_run_reconcile` / `plan_reconcile` / `_layoutOp` / AC4 placeholders

### Diagnosis (locked)

Cold failure is **construction order**, not settle thrash:

```text
today: open all → residual replan (often Mode B) → belt → postOpenRetry
want:  skeleton → open → bind to slots → size/focus → residual only
```

Today structure is **window-anchored**: empty desk → plan has only `open`;
`ensure_layout` is skipped without `windowId`; residual replan joins live
maps and thrash Mode B parks companions. AC1–AC6 residual-geom stand; they
do not fix this.

### 1. Skeleton — what exists before role maps

**Choice: slot-tagged placeholders as mon-child units (extend AC4).**

| Unit | Before any role map |
| --- | --- |
| Mon with hsplit/vsplit ≥2 children | MONITOR layout set; one mon-direct TILE **placeholder leaf per mon child** (term pane = one PH; multi-role tab pane = **one TABBED CON** with N PH leaves in profile order) |
| Multi-role tab/stack group | TABBED/STACKED CON under mon (or under nested split CON), children = placeholders tagged `slot` + `role` |
| Nested h/v under mon child | Nested CON + PH leaves for each leaf role (same as today after join, but pre-built) |

**Why placeholders (not bare empty CONs):**

- `cleanTree()` drops empty CONs and flattens single-child CONs — bare empty
  bags do not survive.
- AC4 already has first-class TILE stubs (`createPlaceholderLeaf`,
  `forge-placeholder`, GetTree-visible) that **do** survive prune.
- Bind = **replace PH with real window** (or move real onto PH then drop PH)
  — same isolation path as fail-open.
- Single-role mon child still gets a PH so mon hsplit has two mon-direct
  children before maps (no “first map owns mon”).

**Not chosen:** invent durable empty CONs + cleanTree exemptions (more
policy surface, fights existing collapse rules). **Not chosen:** CLI-only
reorder of existing ops (no selector without a window).

### 2. Phases (one CLI invocation; internal barriers)

```text
P0  Resolve profile + live candidates (class/title). NO thrash residual policy.
P1  Skeleton commit (RunSteps, freezeRender OK):
      ensure_skeleton → mon splits + tab/stack CONs + slot-tagged PHs
      Barrier: tree shape matches profile mon-child topology (PHs count).
P2  LayoutBatch begin → parallel open (PlaceNext mon hint only).
      NO Mode B. NO structure rewrite from thrash. NO residual park mid-open.
P3  Bind: each mapped role → claim PH (slot/role tag) → replace/move into slot.
      Async OK per role; structure not rebuilt from race.
P4  When all opened roles bound (or timeout + fail-open PH for missing):
      ensure_order + ensure_sizes + focus once.
P5  Residuals close/park **after** bind barrier (profile / --keep-others / --clean).
P6  Thrash detect **report-only** on cold happy path; Mode B recover only if
      operator --recover or mid-session chaos (existing product), never auto
      mid-batch. Drop cold postOpenRetry as success path (optional chaos only).
```

**Parallel:** P2 opens parallel; P3 binds as maps arrive. **Barrier before P5:**
bind complete for launched roles. **Barrier before Mode B:** never on cold
default.

### 3. When thrashState may run

| Moment | Allowed? |
| --- | --- |
| Initial cold plan (P0–P1) | Detect optional for stderr **info only**; **must not** force residual park or role-only structure |
| During open/bind (P2–P3) | **Forbidden** as policy driver |
| After P4 sizes/focus | Report; Mode B only with `--recover` or separate mid-session thrash path |
| Settled re-run (perfect tree) | `nothingToDo`; thrash false |

`--safe` unchanged: open+move only, no skeleton mutation beyond moves if already structured.

### 4. Extension APIs

| Op / change | Role |
| --- | --- |
| **New** plan action `ensure_skeleton` (or `skeleton`) | Pure plan emits mon tree: slots, modes, role ids, optional shares — **no windowIds** |
| **New** RunSteps `skeleton` (or multi-step create-placeholder + layout) | Build mon children + CONs + PHs; tag PH with `layoutSlot` / `layoutRole` (GetTree fields) |
| **Bind** | Prefer replace-PH-with-window; reuse move+drop-PH if simpler in CT1 |
| Existing `ensure_layout` / move / order / size / focus | Keep for mid-session repair and settled re-run structure fix; cold happy path prefers skeleton+bind |
| LayoutBatch / PlaceNext | Keep; PlaceNext mon path only during P2 (attach to sibling optional when PH already mon-local) |
| entered-monitor rehome | Suppress while layout epoch “bind pending” / openLayoutBatchActive (extend existing suppress) |

**CLI:** `_layout_run_reconcile` reorders to skeleton RunSteps **before** opens;
residual replan after open is **bind+order+size+focus+residual**, not Mode B
structure invention. Demote `postOpenRetry` off default success path.

### 5. Failure / placeholders

- Failed open: leave role PH (fail-open isolate AC4) or float client + PH —
  **same product rules as apply-contract**.
- Residual close never deletes claimed role windows; PHs are not “residuals”
  to close as apps — drop only after successful bind or explicit cancel.
- Float / Guake / floating[] claim rules unchanged.

### 6. Tests (CT1 unit bar — no “plan twice”)

| Fixture / assert | Intent |
| --- | --- |
| `tree-empty` + `profile-dev-v2` | Plan emits `ensure_skeleton` (or equiv) **before** opens; no thrash-driven park on empty |
| Skeleton mapper | `actions_to_extension_steps` / new mapper produces skeleton steps without windowIds |
| Phase order pure | One plan model: skeleton → open → bind → order/size/focus; Mode B park **absent** on cold empty |
| Perfect tree | Still `nothingToDo` (idempotent) |
| Extension unit | create skeleton under mock mon; bind replaces PH; cleanTree does not strip slot PHs mid-wave |

Live CT2/CT3 remain operator one-shot checks (not unit).

### CT1 implement scope (files)

| Area | Files |
| --- | --- |
| Plan | `scripts/forge/layout_plan.py` — skeleton actions; thrash policy gate for cold |
| Apply map | `scripts/forge/layout_apply.py` — map skeleton; phase order |
| Orchestrator | `scripts/forge/forge` `_layout_run_reconcile` — skeleton pre-open; demote postOpenRetry |
| RunSteps schema | `lib/extension/run-steps.js` |
| Dispatch | `lib/extension/session-api.js` — skeleton op / PH create + layout |
| Tree / PH | `lib/extension/tree.js`, `layout-placeholder.js` — slot/role tags; bind replace |
| Batch suppress | `lib/extension/window.js` (entered-monitor / rehome while bind pending) |
| Tests | `tests/unit/cli/test_layout_plan.py`, `test_layout_apply.py`, fixtures; optional extension unit for PH skeleton |
| Docs (wrap-up) | `docs/user/layout.md` cold section; DECISIONS row |

**Out of CT1:** live Wayland/X11 (CT2/CT3); gdisplays; Mode B rewrite for mid-session (keep as-is).

### Explicit non-use of Mode B on cold happy path

- No `force_park_residuals` from thrash during P0–P5 cold default.
- No postOpenRetry that re-enters Mode B to “finish” cold topology.
- Mode B remains for true mid-session chaos / explicit recover.

### Open only if spike blocks CT1

| Risk | Fallback |
| --- | --- |
| GetTree cannot carry slot tags on PH | Encode slot in PH title/`id` (`forge-ph:mon0.s0:chrome`) for claim |
| Mon layout without real window selector | Skeleton op sets MONITOR/CON layout by path, not `_layoutOp` window selector |
| PlaceNext fights PH mon child | Bind-only after map; PlaceNext mon index only |

---

## Session note

**2026-08-08 (CT1 done):** Skeleton-first cold path landed (A/B AGREE after rework).
Key: `ensure_skeleton` + `bind` RunSteps; cold thrash report-only; P5 residual after
bind; postOpenRetry opt-in; Mode B mid-session unchanged. Units: 290 plan/apply +
97 JS. Task → `completed/forge-layout-cold-topology_ct1-skeleton.md`.
**Next:** CT2 Wayland live (this host) · CT3 X11 live. No cleanup until both green.
