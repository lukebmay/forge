# Plan: Settle learning (time-to-stable heuristics)

**Status:** active  
**Priority:** mid (post-RC fine; operator chose over more one-off Wayland WR patches)  
**Branch:** `plan/forge-settle-learning`  
**Created:** 2026-08-06  
**Related:** CL3 thrash catalog (`app-thrash-catalog.js`), CL4 open quiet (`layout-open.js`), control-loop verify  

### Session note (overwrite)

**2026-08-06:** **SL1 done** (A/B AGREE). Time-to-stable + raise-only minQuiet on
open path; forest-ok gate fixed (no sample while FLOAT absent from TILE results).
Next: **SL2** layout-batch deferred open samples + debug dump (operator `layout
dev` path currently skips `_scheduleOpenCommit` note).

---

## Why

Today thrash catalog is **event counters** + **Ghostty built-in seed**:

```text
thrashScore = postMapSizeChanges + 2 * postApplyDrift
minQuietMs only from built-in (Ghostty 250ms) or 0
```

User vision: **time-to-stable** learning from Meta↔tree verify so every class
uses the same pipeline; data differentiates apps; brand seeds can drop later.

Operator symptoms that motivate data before more fixes:

| Symptom | Suspected class |
| --- | --- |
| mon0 left TABBED: Grok not visible/open unit after `layout dev` | tab settle / active leaf / residual race |
| Only Ghostty left → `layout dev` → mon0 one giant tab (no split) | residual structure / claim / open batch race |

Learning does not magically fix wrong topology, but **quiet floors + mismatch
timings** will show which classes thrash how long, and open-commit will wait
more accurately. Topology bugs remain separate if samples show settle is fine.

---

## Locked direction

| # | Decision |
| --- | --- |
| **1** | Same pipeline for all apps; no new brand seeds. Existing Ghostty seed stays as **floor** until SL3 evidence. |
| **2** | Primary signal: **elapsed ms** from map/open-commit (and later move/apply) until **window-level** Meta↔slot agreement (then forest SETTLED is free). |
| **3** | Learn `minQuietMs` per class: raise on slow settle / mismatch; pad slightly; **cap** so broken clients cannot demand forever. |
| **4** | v1 **session memory only**; optional debug snapshot/export. Persist file is later (v2). |
| **5** | Data collection first (SL1); use learning for open quiet (still SL1); drop seeds only after operator evidence (SL3). |
| **6** | Do not block RC push/tag on this plan. |

---

## Architecture (target)

```text
open / move / apply
  → stamp t0 (map | openCommit | lastMove)
  → verify Meta↔slot (existing LayoutController)
  → on first window ok after t0: sampleMs = now - t0
  → catalog.recordSettleSample(class, { ms, kind, mismatches })
  → recompute learnedMinQuietMs = clamp(floor, max(seed, pad(max/ema)), cap)
  → next open: catalogMinQuietMs = entry.minQuietMs (learned)
```

| Field (per class) | Meaning |
| --- | --- |
| existing counters | postMapSizeChanges, postApplyDrift, thrashScore, needsExtraVerify |
| `settleSampleCount` | how many time samples |
| `settleMsMax` / `settleMsEma` / `settleMsLast` | time-to-stable stats |
| `mismatchBeforeSettle` | cumulative mismatches while waiting |
| `minQuietMs` | **effective** floor used by open path (seed ∪ learned) |

Pure helpers live in `app-thrash-catalog.js` (unit-tested). Wire from
`layout-controller` / open-commit path without bloating `window.js` further.

---

## Tasks

| Id | Task | Status |
| --- | --- | --- |
| **SL1** | Time-to-stable samples + raise-only learned `minQuietMs` + snapshot + tests | **done** → [completed](./forge-settle-learning/completed/forge-settle-learning_sl1-time-to-stable.md) |
| **SL2** | Layout-batch deferred samples + debug dump | next → [task](../tasks/forge-settle-learning_sl2-batch-dump.md) |
| **SL3** | Drop/relax Ghostty built-in when live samples support it | pending (needs operator evidence) |

---

## Non-goals

- Full redesign of residual layout structure (giant tab / wrong open leaf) as
  part of SL1 — track residuals; fix with data if settle is the cause, else
  separate topology task.
- Persisting heuristics to disk (v2).
- Hard-coding Chrome/Grok/Guake settle tables.

---

## Acceptance (plan-level)

1. Open path uses learned quiet floors when samples exist (not only Ghostty seed).  
2. Unit tests cover sample → minQuiet recompute (raise, pad, cap, seed floor).  
3. Debug snapshot of catalog entries available in-process (tests + Logger).  
4. Operator can re-run `layout dev` after install and inspect logs/snapshot for
   which classes took how long to agree.
