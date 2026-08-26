# Task: CA0 — Recovery architecture documentation

**Plan:** [forge-codebase-audit.md](../plans/forge-codebase-audit.md)  
**Status:** done (docs shipped; move to plan `completed/` when orchestrator wraps)  
**Risk:** low (docs only)  
**Mode:** A/B optional (docs); single agent OK  

---

## Goal

Give agents one durable place that explains **why** thrash/session layers exist and that they are complementary — so future work stops stacking redundant guards.

Update `docs/DESIGN.md` (soft rehome + session layout sections; add a short unified “Recovery architecture” section if cleaner).

---

## Primary files

- `docs/DESIGN.md`
- Cross-link only if needed: `agents/plans/forge-codebase-audit.md` (already has inventory)

---

## Acceptance

- [x] Diagram (ASCII or markdown) covering:
  - last-good homes
  - soft rehome (H1) + 300ms debounce
  - T6 snapshot / `restoreTreeIfNeeded`
  - T7 stableKey
  - majority mon remap (T6 only)
  - session-layout portable disk path
  - strict mon resolve (session; **not** majority)
  - richness guard + 12s save hold
  - session shield ~3s (soft rehome re-applies forest)
  - entered-monitor suppression windows
- [x] Explicit note: **do not merge** `resolveStrictMonitor` and `resolveTargetMonitor` without a product redesign
- [x] Explicit note: **do not remove** shield / hold / richness without live dual-head proof
- [x] Brief timer/debounce list (or pointer to plan § “Debounce / timers inventory”)
- [x] Raise/restack policy can wait for CA6 — optional one-liner “multiple raise paths; see CA6”
- [x] No code / test changes
- [x] Plan session note updated after ship

---

## Suggested content sources (already investigated)

| Doc / code | Use |
| --- | --- |
| `docs/DESIGN.md` existing H1 / session / T6 / T7 sections | Expand, don’t contradict |
| Plan thrash diagram | Canonical inventory |
| `window.js` soft rehome + session restore | flags: `_workareasThrashPending`, `_sessionLayoutRestoring`, `_sessionLayoutShield` |
| `session-layout.js` `resolveStrictMonitor` | strict policy |
| `tree-snapshot.js` `resolveTargetMonitor` | majority / stableKey |

---

## Out of scope

- Code moves, logger changes (CA1), extractions (CA4+)
- Fixing Ghostty residual product bugs
- gdisplays / EDID

---

## Test plan

None (documentation only).

---

## Session note

**2026-07-25 (CA0 ship):** Added cohesive **Recovery architecture** section at top of `docs/DESIGN.md` (diagram, layer table, dual mon-resolve, keep-guards, T6-only production vs layout-group test/compat, recovery timers + plan pointer, CA6 raise one-liner). Cross-linked H1 / session / T6 / T7 sections without contradicting detail. No code/tests. Next: CA1 session diagnostic noise.