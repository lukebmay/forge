# Task: forge-settle-learning_sl2-batch-dump

**Status:** done  
**Priority:** mid  
**Plan:** [forge-settle-learning.md](../../forge-settle-learning.md)  
**Branch:** `plan/forge-settle-learning`  
**Created:** 2026-08-06  
**Completed:** 2026-08-06  

## Goal

Close layout-batch settle data hole + thrash catalog debug dump.

## Acceptance

All met (A/B AGREE).

## Session note

**2026-08-06:** Shipped.

- Idempotent `noteOpenPendingForSettle` (earliest openedAt)
- Deferred release stamps settle pending via `mappedAt`
- DBus `GetThrashCatalog` (API v9) + CLI `forge thrash`
- 124 related unit tests green
- Stretch Move/apply skipped

**Operator next:** install + logout → `forge layout dev` → `forge thrash` for samples.
