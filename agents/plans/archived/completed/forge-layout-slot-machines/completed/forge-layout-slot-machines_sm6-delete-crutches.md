# forge-layout-slot-machines_sm6-delete-crutches — Delete belt and false-ok

**Status:** done  
**Plan:** [forge-layout-slot-machines](../../forge-layout-slot-machines.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Agent:** **Grok 4.5** implementer  
**Depends:** **SM4 + SM5 done**; SM7 done (overlay)  
**Completed:** 2026-08-16

## Goal

Delete product-path crutches the machines replace (D042 / L7). No dual
spine.

## Acceptance

- [x] Product ApplyLayout does not run belt or `beltStructure`
- [x] No hard-timeout warn-and-continue success path
- [x] No focus-only `Done.ok`
- [x] D014 already **superseded** (D042) — leftover belt **code** and
      tests that treat belt-as-success deleted/rewritten
- [x] Dead helpers / tests that exist only for belt-as-success deleted
      or rewritten to forest-match
- [x] Nest mon=1 clean passes without belt; ghosttys still open-miss flake

## Context for the next agent

### Changed

| Path | Change |
| --- | --- |
| `layout-apply-run.js` | Removed focus/verify belt phases, `_runBeltIfNeeded`, belt result fields; verify is `_runVerifyOnce` only; Done.ok remains forest-match |
| `layout-apply-settle.js` | Deleted `beltActionsFromPlan`, `runBeltMovesOnly`, `partitionBeltStructureSteps`, `runBeltStructureRebind` |
| `session-api.js` | Comments only (no belt wording on product path) |
| `docs/dev/contracts.md` | Belt deleted (D042/SM6) |
| Tests | Belt-as-success → no-belt progress + forest-match fail (R036 residual class kept as symptom) |

### Proven

```bash
npm test -- tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/extension/layout-apply-slot.test.js
# 3 files / 79 green

npm test -- tests/unit/extension/session-api-layout-cycle.test.js \
  tests/unit/extension/layout-apply-chrome.test.js \
  tests/unit/extension/action-pipeline.test.js
# 3 files / 67 green

./install --kit=vim
forge nested run -- bash -lc 'env FORGE_JOB=0 forge layout _forge-test-clean'
# PASS ok; no belt progress
forge nested run -- bash -lc 'env FORGE_JOB=0 forge layout _forge-test-ghosttys'
# FAIL open-miss (ghostty,ghostty-2) ×2 — known cold map flake, not belt
forge nested status   # running: False
```

### Residual

- Host R036 cold `layout dev` after logout — human; do **not** claim PASS
- Nest ghosttys open-miss residual (pre-SM; not SM6)
- Tab D0 group chrome A
- Python CLI residual belt helpers (if any) are **not** product ApplyLayout;
  freeze/oracle later after SM6 (PRIORITY P3)

## Session note

**2026-08-16 SM6 done (4.5).** Product dual spine removed: no belt /
`beltStructure` on ApplyLayout; hard continue ≠ success (forest-match);
verify-once ≠ Done.ok. Uncommitted on `master`.
