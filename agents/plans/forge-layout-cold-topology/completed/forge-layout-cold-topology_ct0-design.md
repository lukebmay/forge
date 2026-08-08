# CT0 — Cold layout topology: design lock

**Status:** done  
**Plan:** [forge-layout-cold-topology.md](../../forge-layout-cold-topology.md)  
**Branch:** `plan/forge-layout-cold-topology`  
**Owner:** agent + human — **approved 2026-08-08**  

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

- [x] Written design in plan (CT0 design lock section)  
- [x] Written design **approved** with human (2026-08-08)  
- [x] Explicit **non**-use of Mode B on cold happy path (locked in plan)  
- [x] CT1 implement scope listed (files, ops)  
- [x] No code required for CT0 (spike only if PH/GetTree gaps block CT1)  

---

## Session note

**2026-08-08:** CT0 complete. Design approved. Skeleton = slot-tagged AC4
placeholders; phases skeleton→open→bind→size→residual; Mode B not cold happy
path. Unlocks CT1 on `plan/forge-layout-cold-topology`.
