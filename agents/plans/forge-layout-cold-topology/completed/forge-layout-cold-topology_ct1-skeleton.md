# CT1 — Skeleton-first cold path (implement)

**Status:** done  
**Plan:** [forge-layout-cold-topology.md](../../forge-layout-cold-topology.md)  
**Depends:** CT0 design lock — **done (approved)**  
**Branch:** `plan/forge-layout-cold-topology`

---

## Goal

Implement one-command cold layout: **structure skeleton before bind**; no Mode B thrash-recover mid-batch.

Follow CT0 lock in plan § “CT0 design lock”: slot-tagged placeholders, phases
P0–P6, no Mode B on cold happy path. Scope file list in that section.

---

## Acceptance

- [x] Phase order matches CT0 lock (unit/fixture proofs) — **incl. P5 after bind**  
- [x] Thrash detection not interleaved with open/bind  
- [x] No “plan twice” product path  
- [x] Mode B remains available for true mid-session chaos only  
- [x] `npm test` / layout unit suite green  

---

## Session note

**2026-08-08:** CT1 shipped (A/B AGREE after rework r2).

### What landed
- Plan: `ensure_skeleton` on cold empty; `bind` when layoutRole PHs present;
  thrash park suppressed on cold / just_opened; residual close/park after bind.
- Apply: skeleton → role move → bind → residual close/park → layout/order/size/focus.
- Extension: RunSteps `skeleton`/`bind`; slot-tagged AC4 PHs; `_layoutBindPending`
  lifecycle (batch end / RunSteps end / idle / disable).
- CLI: `postOpenRetry` opt-in only (`FORGE_LAYOUT_POST_OPEN_RETRY=1`).
- Docs: layout.md cold section; DECISIONS D008/D009.

### Tests
- pytest layout plan+apply: **290 passed**
- vitest run-steps / PH / Tree / WM-open-commit: **97 passed**

### Next
- CT2 Wayland live (operator; not A/B coding)
- CT3 X11 live (required parity)
- Cleanup dead cold fallbacks only after CT2+CT3 green
