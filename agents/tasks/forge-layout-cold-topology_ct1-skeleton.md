# CT1 — Skeleton-first cold path (implement)

**Status:** ready  
**Plan:** [forge-layout-cold-topology.md](../plans/forge-layout-cold-topology.md)  
**Depends:** CT0 design lock  
**Branch:** `plan/forge-layout-cold-topology`

---

## Goal

Implement one-command cold layout: **structure skeleton before bind**; no Mode B thrash-recover mid-batch.

---

## Acceptance

- [ ] Phase order matches CT0 lock (unit/fixture proofs)  
- [ ] Thrash detection not interleaved with open/bind  
- [ ] No “plan twice” product path  
- [ ] Mode B remains available for true mid-session chaos only  
- [ ] `npm test` / layout unit suite green  

---

## Session note

Created 2026-08-08. Do not implement until CT0 approved.
