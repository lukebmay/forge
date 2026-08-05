# Task: forge-layout-control-loop_cl1-verify-scanner

**Status:** done  
**Plan:** [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-05  
**Completed:** 2026-08-05

## Goal

Replace the CL0 verify **stub** with a real **Meta ↔ tree slot** scanner plus an
**agreement counter** so a forest can become SETTLED only after ≥2 consecutive
full agreements (plan defaults). Wire it into the existing debounced
`requestVerify` path; post-render already schedules verify (CL0).

## Acceptance

1. Pure helpers: ε=4, mon match, forest result shape — **met**
2. Agreement ≥2 SETTLED; markUnsettled; auto agreement-confirm — **met**
3. TILE scan; skip float/grab/dead — **met**
4. Mismatch latch requestLayout once/wave — **met**
5. Thorough unit tests — **met**
6. npm test green — **met** (2001)
7. No CL2–4 / soft-rehome rename — **met**

## Session note

**2026-08-05:** CL1 done — A + B **AGREE**.

### Shipped
- `lib/extension/layout-verify.js` — pure rect/mon/scan helpers
- `LayoutController` real verify, agreementCount/settled, markUnsettled,
  agreement-confirm second pass, verify-mismatch layout latch
- Tests: layout-verify + extended layout-controller
- Docs: architecture + rendering verify/SETTLED

### Next
- CL2: external geometry → markUnsettled; suppress attribution for Forge apply
