# forge-canonical-contracts_ic0-catalog — Contract catalog + D024–D026

**Status:** done
**Plan:** [forge-canonical-contracts](../forge-canonical-contracts.md)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

Publish the job → API catalog and lock D024 (drop-intent), D025 (reveal),
D026 (tile-slot) so later slices extend those contracts.

## Acceptance

- [x] `docs/dev/contracts.md` exists and is linked from DESIGN / project /
      HANDOFF / PRIORITY
- [x] DECISIONS D024–D026 rows
- [x] Plan + follow-up tasks IC1–IC4
- [x] Existing related plans noted (DnD residual, FCC after contracts)

## Context for the next agent

- Catalog: `docs/dev/contracts.md`
- IC1–IC3 shipped. Next: live smoke R019/R020. Do not start FCC C0.

## Session note

**2026-08-13:** Catalog + plan + decisions written from the API audit.
Grok→Chrome CENTER no-op root-caused in `_isNoOpDrop` (D024 / IC1).
VLC fullscreen is apply-skip + no restore (D026 / IC3).
