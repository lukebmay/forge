# Plan: cold layout topology (one-shot, no Mode B patch-over)

**Status:** ready — first task is design lock  
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

## Tasks

| ID | Task | Status |
| --- | --- | --- |
| **CT0** | [Design lock](../tasks/forge-layout-cold-topology_ct0-design.md) — phases, APIs, acceptance | **ready** |
| CT1 | Implement skeleton-first cold path (unit + dry fixtures) | blocked on CT0 |
| CT2 | Live Wayland one-shot `layout dev` on black | blocked on CT1 |
| CT3 | Live X11 smoke parity | after CT2 |

---

## Acceptance (plan-level)

- [ ] Cold desk (0–2 ghosts, chrome not open) → single `forge layout dev` → mon0 `tab(chrome,Grok)|ghostty`, mon1 `ghostty|tab(YT,Gmail,Voice)` without Mode B stderr path  
- [ ] Settled re-run still idempotent (reused N, moved 0 when already correct)  
- [ ] No thrash-recover interleaved with open/bind  
- [ ] Unit tests for phase order; no “run plan twice” test as success  
- [ ] docs/user/layout.md cold section updated  

---

## Session note

**2026-08-08:** Plan opened after reboot incident analysis. Cold Mode B residual confirmed architectural, not settle-thrash regression. Operator rejected login-time display ensure; gdisplays multi-config duals stay separate. Next: CT0 design lock, then implement on `plan/forge-layout-cold-topology`.
