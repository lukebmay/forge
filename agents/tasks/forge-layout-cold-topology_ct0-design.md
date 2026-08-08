# CT0 — Cold layout topology: design lock

**Status:** ready  
**Plan:** [forge-layout-cold-topology.md](../plans/forge-layout-cold-topology.md)  
**Branch:** `plan/forge-layout-cold-topology` (create from master when starting implement)  
**Owner:** agent + human approve design before CT1 code  

---

## Goal

Lock an architecture for **one-shot cold `forge layout`** that does **not** rely on Mode B thrash-recover or a second CLI invocation.

---

## Context (must not re-litigate)

| Done | Meaning |
| --- | --- |
| Apply contract AC1–AC6 | Residual geom = echo; no forest fight Meta |
| Thrash-zero Mode A/B | Mid-session chaos recover; **not** cold success path |
| Live RC smoke | Mode B second pass works; cold first pass fails often |

**Operator direction (2026-08-08):**

- Tree **shape** must not be constructed by racing async maps.  
- Windows may **bind** asynchronously to a known skeleton.  
- Do **not** run thrash correction while layout ops are in flight.  
- No second-pass product patch.

---

## Deliverable

A short design section in the plan (or `docs/DESIGN.md` pointer) that answers:

1. **Skeleton:** What exists in Meta/Forge tree before any role window is mapped? Empty CON? First-window seeds?  
2. **Phases:** Ordered list with “what may run in parallel” vs “barrier.”  
3. **When thrashState may run:** Only after bind complete (or never on cold path).  
4. **Extension APIs:** New RunSteps ops vs existing ensure_layout/move only.  
5. **Failure:** Placeholder/float rules unchanged from apply-contract.  
6. **Tests:** Fixtures that prove one plan output places correctly without “plan twice.”

---

## Acceptance

- [ ] Written design approved (or iterated once) with human  
- [ ] Explicit **non**-use of Mode B on cold happy path  
- [ ] CT1 implement scope listed (files, ops)  
- [ ] No code required for CT0 unless spike proves an API gap  

---

## Session note

Created 2026-08-08 for handoff. Start here after Wayland reload; do not implement CT1 until design lock.
