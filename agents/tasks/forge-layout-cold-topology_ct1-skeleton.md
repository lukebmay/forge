# CT1 — Skeleton-first cold path (implement)

**Status:** ready  
**Plan:** [forge-layout-cold-topology.md](../plans/forge-layout-cold-topology.md)  
**Depends:** CT0 design lock — **done (approved)**  
**Branch:** `plan/forge-layout-cold-topology`

---

## Goal

Implement one-command cold layout: **structure skeleton before bind**; no Mode B thrash-recover mid-batch.

Follow CT0 lock in plan § “CT0 design lock”: slot-tagged placeholders, phases
P0–P6, no Mode B on cold happy path. Scope file list in that section.

---

## Acceptance

- [ ] Phase order matches CT0 lock (unit/fixture proofs)  
- [ ] Thrash detection not interleaved with open/bind  
- [ ] No “plan twice” product path  
- [ ] Mode B remains available for true mid-session chaos only  
- [ ] `npm test` / layout unit suite green  

---

## Session note

**2026-08-08:** CT0 approved. Next session: implement CT1 (A/B for code).
After CT2/CT3 live green, schedule cleanup sweep of cold fallbacks.
