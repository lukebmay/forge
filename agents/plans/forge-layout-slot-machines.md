# Plan: layout slot machines (per-slot hard place + ApplyEpoch)

**Status:** **SM0 locked** (2026-08-16) — implement SM1–SM7  
**Priority:** **P0**  
**Branch:** `master`  
**Created:** 2026-08-16  
**Decisions:** [D039](../../docs/DECISIONS.md)–[D043](../../docs/DECISIONS.md)
(amend D019 execution; **D010/D014 superseded** — overlay=D043, belt=D042/SM6)  
**Related:** [settle contract](./forge-layout-settle-contract.md),
[ApplyLayout](./forge-layout-in-process.md) (AL0–AL8 shipped),
R036 [task](../tasks/forge-layout-cold-apply-structure.md) ·
[REG](../REGRESSIONS.md)

### Session note (overwrite)

**2026-08-16:** Operator locked SM0. Slot **not** window; hard = in-slot;
`Done.ok` = required forest match; contracts (SM1–SM3) before machine
runtime (SM4); belt dies after open-into-slot; group chrome A is tab/FCC.
**Next:** 4.5 **med orchestrator** assigns SM1 then SM2. **No SM4 before
SM2+SM3.** D0 in
[completed](./forge-layout-slot-machines/completed/forge-layout-slot-machines_d0-discussion.md).

---

## Problem

Cold/mid `ApplyLayout` still couples settle to a **monolithic phase spine**
and to **several writers of window home** (PlaceNext, entered-monitor,
belt, workareas, D026, grab). Hard timeout **warns and continues**.
`windowIsSettled` is TILE-anywhere (id + TILE + sane rect + mon ≥ 0).
`Done.ok` can be true while mon1 is empty (R036). Soft max-corrections
burn when structure/mon ownership is wrong.

Desired placement is already known: **profile → tree slots**.

---

## Locked architecture (do not re-litigate)

### Goal

One writer + honest hard + honest `ok`. “Less spine” is a side effect,
not the goal.

```text
apply epoch (home authority = desired forest)
        │
        ▼
materialize forest
  skeleton + bind existing + open missing INTO slots
        │
   ┌────┼────┐
   ▼    ▼    ▼
 slot   slot  slot     ← parallel only if independent
 open→place→hard→retry
   │    │    │
   └────┼────┘
        ▼
forest match (Done.ok)
        ▼
focus once + soft + verify
        ▼
release epoch     D026 stays forever (idle only)
```

### L1 — Authority (confirm)

| # | Lock |
| --- | --- |
| **L1.1** | Desired state = **tree slots** (topology, mon, order, size shares, open leaf) from profile data. |
| **L1.2** | Meta reports noise; TILE **slot is authority** (D026). FLOAT / `mode: ignore` out of scope. |
| **L1.3** | Structure bugs (wrong mon children, flat tabs) are **not** soft-timeout bugs. |

### L2 — Execution shape (amended: slot, not window)

| # | Lock |
| --- | --- |
| **L2.1** | A **slot** is a desired-forest leaf: one TILE window **or** one TABBED/STACKED CON (all members). Not N independent app machines that share a parent. |
| **L2.2** | Machines run **in parallel across independent slots** only. |
| **L2.3** | **Serial inside one slot** (open → place → hard → retry → solo border if any). |
| **L2.4** | Product path: **ApplyEpoch → materialize forest → slot machines → forest-match → focus/soft → release epoch**. Continuous TILE geom stays on forever (idle). |
| **L2.5** | Do not delete structure. Machines place/hard into an established forest. They do not invent topology. |

### L3 — Hard settle = in-slot retry (amended predicates)

| # | Lock |
| --- | --- |
| **L3.1** | Hard = TILE (or grab) **and** desired monitor **and** desired parent CON **and** frame within ε of the slot rect. Clock from our place act. TILE on the wrong mon is **pending**, not ready. |
| **L3.2** | On hard timeout: **re-issue** that **slot’s** place, then wait hard again. |
| **L3.3** | N = **2** extra retries (**3** place attempts). First wait **5s**; retry waits **2s**. Exhausted → `hard-failed` for that slot only — do not abort peers. |
| **L3.4** | Late hard signals **resume** the machine only **while the apply epoch is live**. After Done, late TILE is D026 / idle — not a zombie machine. |
| **L3.5** | Hard miss is not soft residual learning success. |
| **L3.6** | Today’s “one 5s wait → warn → continue whole spine” is **dead** on the product path (D040). |

### L3b — `Done.ok` (D041)

| # | Lock |
| --- | --- |
| **L3b.1** | `Done.ok` = forest match for every **required** TILE slot (roles present, CON/layout, mon, child order, TILE in slot). |
| **L3b.2** | Focus verify is **not** success. Soft max-corrections must not flip a structure fail into `ok`. |
| **L3b.3** | Any required `hard-failed` → `ok: false`, `code: hard-failed`, named slot list. |
| **L3b.4** | **Execution always continues** other machines and then focus on what landed. Continuation ≠ success. |
| **L3b.5** | FLOAT / `ignore` / non-tile roles are **not** required hard targets. |
| **L3b.6** | Hard-fail should be **rare**. If it is common, the hard contract is wrong (too tight, or optional/float in the hard set, or place still broken). Do **not** add standing best-effort `ok: true`. |

### L4 — Chrome / visual / focus gates

| Kind | Gate |
| --- | --- |
| **Apply overlay** (R027) | Apply epoch through **all-hard** (or failed) — D043 |
| **Tab/stack group chrome** | Option A — singular CON decoration. **Implement in tab/FCC D0**, not SM1–SM4 |
| **Solo TILE border** | That slot hard-ready |

| # | Lock |
| --- | --- |
| **L4.1** | TABBED/STACKED: **option A**. Not N full chromes that swap with visibility. |
| **L4.2** | Partial A OK: draw strip when CON bound + ≥1 hard member. |
| **L4.3** | Open-leaf change: restack + `lastTabFocus` (D018/D025/R032). |
| **L4.4** | **Option B rejected.** |
| **L4.5** | Solo TILE border after **that** slot hard-ready. |
| **L4.6** | Profile open leaves + keyboard focus + “desk finished”: after all required slots hard-done or hard-failed. |
| **L4.7** | Hidden tab peers must not paint as independent full TILE borders (R031 class). |

### L5 — Coupling

| Coupling | Rule |
| --- | --- |
| Chrome-family open (D034) | Serialize **opens** — parallel same-profile Chrome crashes |
| Shared TABBED/STACKED CON | **One** slot machine |
| Desired forest / skeleton | Before parallel place |
| Apply-time mon ownership | ApplyEpoch (D039); not a WindowManager boolean |
| Workareas mid-apply | Cancel apply (`displays-changed`); do not interleave H1 |
| D026 during epoch | Idle-only; machines own place |
| Focus / open leaf | All required slots terminal |

### L6 — Continuous geom

| # | Lock |
| --- | --- |
| **L6.1** | Keep D026: unsolicited size/move/max/Meta-fs (no grab, not forge echo) → restore to slot for TILE. **Idle only.** |
| **L6.2** | Does not replace hard place during apply. |
| **L6.3** | Soft focus residual (D019 SE3) remains after all-settled focus apply. |

### L7 — Non-goals

| Rejected | Why |
| --- | --- |
| Absolute Meta x,y as source of truth | Slot/tree authority |
| Infinite hard retry | Hide broken maps |
| Soft/wait fixes wrong mon children | Structure ownership |
| Mode B as cold success | Existing FIRM |
| Personal role product branches | Profiles = data |
| Dual-path forever (old spine + machines) | SM6 deletes crutches |
| Standing best-effort `Done.ok` | Today’s false-ok |
| Per-window machines on TILE-anywhere hard | Retry into the same lie |
| Group-chrome implement inside SM1–SM4 | Tab/FCC D0 |
| `layout_plan.py` → `cli/` | D036 / D037 |

---

## Relation to shipped settle (D019)

| Keep | Amend / evolve |
| --- | --- |
| Hard vs soft split | Hard = **in-slot**; timeout → retry place |
| Soft focus barrier + heuristics file | After all-settled focus |
| Verify once | After soft; **not** the `ok` definition |
| Open-leaf pin D018 | Still post-focus |
| D026 TILE slot | Idle controller; suppressed in epoch |
| Phase names for logging | Execution is epoch + machines + barriers |

Do **not** reintroduce fixed 250 ms reassert forever or GetTree poll twins.

---

## Other architectural flaws (not this plan’s implement DAG)

Recorded so orchestrators do not mix them into SM1–SM7:

| Flaw | When |
| --- | --- |
| `window.js` god-object | Extract epoch/machines; no rewrite |
| Session restore vs ApplyLayout (R018) | After SM honest — 4.6 high |
| `_layoutOp` flatten (REG-ensure-flatten) | FCC C2, then 4.5 high strip |
| FCC C2–C5 + owning-split resize | After apply honesty |
| Three placeholder kinds (skeleton / AC4 / D006) | Taxonomy in SM3; no fourth kind |
| Python `layout_plan.py` still alive | Freeze as dump/oracle after SM6 — 4.5 lo |
| Cross-mon TABBED undefined | Tab D0 — 4.6 xhigh after SM7 |
| STACKED / ratio autotile | Later; own D0 |

---

## Migration (FIRM)

1. **SM1–SM3 first** (named epoch, in-slot hard + forest-ok, open-into-slot).
2. **Then SM4** machine runtime. Do not start machines on today’s predicates.
3. **SM5** moves focus/soft after the all-hard barrier.
4. **SM6** deletes belt / continue-on-timeout / focus-only-as-ok.
5. **SM7** overlay clear = all-hard.
6. No dual forever-path.

---

## Test strategy

| Layer | What |
| --- | --- |
| L0 SM1 | Epoch begin/end drops deferred rehomes; workareas mid-epoch → cancel |
| L0 SM2 | TILE-wrong-mon is pending; empty required mon fails `Done.ok`; hard timeout does not continue as success |
| L0 SM3 | Apply PlaceNext dest is PH/slot id, never mon-root-only |
| L0 SM4 | Independent slots parallel; shared TABBED is one machine; retry then hard-failed; late resume only in-epoch |
| L0 SM5–SM7 | Focus after all-hard; belt gone; chrome clear reason `all-hard` |
| Nest | After **SM4** (not each unit slice): mon=1 `_forge-test-clean` + `_forge-test-ghosttys`. Dual nest only for SM3/SM4 mon ownership |
| Host | Human cold `layout dev` after logout (R036). Do not claim cold PASS without live tree |

---

## Work division (agents)

Prompt the **role** in the spawn (no separate “medium” slug).
**xhigh = architecture lock only.**

| ID | Work | Agent | Depends |
| --- | --- | --- | --- |
| **SM0** | D0 lock (this) | **4.6 xhigh** | — **done** |
| **SM1** | Named ApplyEpoch | **4.5 high** | SM0 |
| **SM2** | In-slot hard + forest-match `Done.ok` | **4.6 high** | SM0 (may overlap SM1 if no `window.js` rehome edit) |
| **SM3** | Open into slot; no mon-root PlaceNext | **4.6 high** | SM1 |
| **SM4** | Slot-machine runtime + retry | **4.6 high** implement; **4.6 high** review of the bag API | SM2 + SM3 |
| **SM5** | Focus + soft after all-hard | **4.5 med** | SM4 |
| **SM6** | Delete belt / continue-on-timeout / focus-only-as-ok | **4.5 med** | SM4 + SM5 nest mon=1 green |
| **SM7** | Overlay clear = all-hard | **4.5 med** | SM4 barrier |

**Orchestrator (next session):** **Grok 4.5 med**. Assign SM1, then SM2
(parallel OK). Do **not** assign SM4 before SM2+SM3. Do **not** start tab
code. Do **not** port `layout_plan.py`. Do **not** implement SM as the
orchestrator unless a 4.5-med slice is the only eligible work.

---

## Acceptance (plan-level)

- [x] D0 complete: confirm/amend/reject, locks, OPEN none on L1–L7
- [x] DECISIONS D039–D043 written; D019 amended
- [x] SM1–SM7 tasks drafted
- [x] PRIORITY queue updated
- [ ] SM1–SM7 implement (blocked on assignment)
- [ ] R036 host cold still human (logout)

---

## Tasks

| ID | Task | Status | Agent |
| --- | --- | --- | --- |
| **SM0** | [D0](./forge-layout-slot-machines/completed/forge-layout-slot-machines_d0-discussion.md) | **done** | 4.6 xhigh |
| **SM1** | [ApplyEpoch](../tasks/forge-layout-slot-machines_sm1-apply-epoch.md) | ready | 4.5 high |
| **SM2** | [In-slot hard + Done.ok](../tasks/forge-layout-slot-machines_sm2-in-slot-hard.md) | ready | 4.6 high |
| **SM3** | [Open into slot](../tasks/forge-layout-slot-machines_sm3-open-into-slot.md) | ready | 4.6 high |
| **SM4** | [Slot-machine runtime](../tasks/forge-layout-slot-machines_sm4-runtime.md) | ready (blocked SM2+SM3) | 4.6 high |
| **SM5** | [Focus after all-hard](../tasks/forge-layout-slot-machines_sm5-focus-after-hard.md) | ready (blocked SM4) | 4.5 med |
| **SM6** | [Delete crutches](../tasks/forge-layout-slot-machines_sm6-delete-crutches.md) | ready (blocked SM4+SM5) | 4.5 med |
| **SM7** | [Overlay all-hard](../tasks/forge-layout-slot-machines_sm7-overlay-all-hard.md) | ready (blocked SM4) | 4.5 med |

---

## Doc map

| Doc | Role |
| --- | --- |
| This plan | Locked architecture + DAG |
| [D0 completed](./forge-layout-slot-machines/completed/forge-layout-slot-machines_d0-discussion.md) | Meeting record |
| [DECISIONS](../../docs/DECISIONS.md) | D039–D043 |
| [contracts](../../docs/dev/contracts.md) | Named APIs to extend |
| [PRIORITY](../PRIORITY.md) | Queue + orchestrator rules |
| [HANDOFF](../HANDOFF.md) | Cold-continue |
