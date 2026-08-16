# forge-layout-in-process_al8-cli-cutover — Thin client + delete waiters

**Status:** done  
**Plan:** [forge-layout-in-process](../../plans/forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** 4.5 medium

## Goal

`forge layout <name>` loads the profile, starts ApplyLayout, streams
Progress, waits Done. Delete the Python poll apply body. Close IC4
as skipped.

## Acceptance

- [x] Live `_forge-test-*` apply PASS on the new path (not personal
      `dev` / `t1`) before deleting Python waiters
- [x] Client: resolve profile, optional gdisplays / SettingsLoad,
      `ApplyLayout`, stream phase lines, map Ctrl+C →
      `CancelLayoutApply`, write `applyId` into D021 status
- [x] Default = new path; `FORGE_LAYOUT_LEGACY` deleted after live PASS
- [x] Deleted: GetTree poll waiters, `_layout_final_focus_pass`
      sleep, CLI LayoutBatch chrome/begin orchestration
- [x] IC4 task closed as **skipped**
- [x] contracts.md Settle table: CLI layout no longer waits
- [x] `layout list|show|save` may remain Python
- [x] Node `cli/layout.mjs` MAY land later — Python ApplyLayout enough
- [x] Unit tests for new client path; pure layout_apply tests green

## Context for the next agent (complete + succinct)

- Client: `scripts/forge/layout_apply_client.py` +
  `forge._layout_run_reconcile_apply_layout`
- Product path: preamble → ApplyLayout → signals/poll GetLayoutApply → Done
- Dry-run / `--tree-file`: host GetTree + `plan_reconcile` only (no mutation)
- Deleted from `layout_apply.py`: `wait_until_hard_ready`, `run_soft_*`,
  `wait_for_open_role_pins`, `wait_for_tree_stable`
- Launch still uses `wait_for_wm_class` + `window_is_settled` (not layout)
- IC4: skipped under
  `agents/plans/forge-canonical-contracts/completed/…_ic4-settle-fold.md`
- Live nest mon=1: `_forge-test-clean` + `_forge-test-ghosttys` **PASS**
- Residual: dual-mon `_forge-test-dual` not re-run this slice

## Session note

**2026-08-15:** AL8 done.

Landed:
- `layout_apply_client.py` (request, feature-detect apiVersion≥10,
  Progress/Done + poll fallback, Ctrl+C cancel, D021 applyId)
- `forge` product reconcile → ApplyLayout; deleted
  `_layout_run_reconcile_body` / final-focus / LayoutBatch product chrome
- Deleted GetTree poll waiters in `layout_apply.py`
- `FORGE_LAYOUT_LEGACY` removed
- contracts Settle table: CLI layout no longer waits; IC4 skipped

Live (nest mon=1, nest stopped after):
- `_forge-test-clean` → ApplyLayout → ok (no-open)
- `_forge-test-ghosttys` → open pinned 2/2, hard-ready 2, verify match → ok

Tests: `test_layout_apply_client.py`; remaining `test_layout_apply.py`
helpers; AL extension suite green.
