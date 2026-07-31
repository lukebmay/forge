# B-resize-autotile — Lock yuiop resize + auto-tile shortlist

**Status:** parked
**Severity:** soft (was misfiled as hard)
**Owner:** human
**Kind:** design
**Plan:** forge-resize-and-autotile
**Unblocks:** optional only — `forge-resize-and-autotile_d0-discussion` stays **draft**
**Priority:** was P3
**Closed:** 2026-07-31

## Why parked

Not a hard agent gate and not on the critical path:

- **Structural** resize (owning-split) lives in [forge-first-class-containers](../plans/forge-first-class-containers.md) Wave **R1 — done**.
- This plan keeps only **optional** ratio-step (`yuiop`) + auto-tile algorithms.
- No required implement slice is waiting. Leaving it **open** made optional design look like a real queue block.

Re-open as **soft** (or hard, only if a required task is blocked) if product wants yuiop/auto-tile soon. Until then, decisions stay in the discussion plan when interest returns.

## Original open questions (historical)

- [ ] Lock ratio-resize key semantics (`yuiop` or alternate) vs Safe edge y/u/i/o
- [ ] “1/3” / “1/2” / double: relative share, absolute of parent, or snap targets
- [ ] CLI surface (`forge size` verbs)
- [ ] Pick 1–2 auto-tile algorithms for first spike

## Done when

Parked without product lock — **OK**. Unpark + lock into plan only if implementing.
