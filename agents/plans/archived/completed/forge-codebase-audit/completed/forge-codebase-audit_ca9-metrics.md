# Task: CA9 — Line-count gate + handoff metrics

**Plan:** [forge-codebase-audit.md](../../forge-codebase-audit.md)  
**Status:** done (A/B AGREE)  
**Risk:** low  
**Mode:** A/B implement–verify  

---

## Goal

Record post-wave-1 line counts; decide if backlog DnD extract (B1) is worth wave 2; update plan + PRIORITY. No required code if targets already met.

---

## Acceptance

- [x] Table of `window.js` / `tree.js` / new modules line counts
- [x] window.js aspirational &lt;4k (stretch &lt;3.5k); tree.js &lt;2.5k — report pass/fail honestly
- [x] Backlog entries confirmed or dropped (esp. B1 DnD if window.js still &gt;3.5k)
- [x] Plan status / PRIORITY updated for wave-1 complete
- [x] Optional: full `npm test` smoke
- [x] Task + plan session notes updated

---

## Out of scope

- More extractions in same task
- Implementing B1

---

## Session note

**CA9 A (2026-07-26):** Metrics only. No code extractions.

| File | Baseline | Now | Δ |
| --- | ---: | ---: | ---: |
| `window.js` | ~5062 | **4431** | −631 |
| `tree.js` | ~2910 | **2572** | −338 |
| `session-layout-restore.js` | — | 477 | CA4 |
| `soft-rehome.js` | — | 284 | CA5 |
| `tree-layout.js` | — | 337 | CA7 |

**Targets:** window &lt;4k **FAIL**; stretch &lt;3.5k **FAIL**; tree &lt;2.5k **FAIL** by ~72.

**Backlog:** **B1 DnD** keep as optional wave 2 (high ROI; window still &gt;3.5k). B3 stay deferred. Micros opportunistic. Wave 1 **complete** (CA0–CA9).

**Tests:** `npm test` 184 files / 1868 tests green. No commit.

**CA9 B (2026-07-26): AGREE.** Re-ran `wc -l` — all five counts match. PRIORITY shows wave 1 done and optional B1 (window &gt;3.5k). Diff is agents docs only (`PRIORITY.md`, plan, this task). `npm test` reconfirmed 184/1868. No doc mistakes.
