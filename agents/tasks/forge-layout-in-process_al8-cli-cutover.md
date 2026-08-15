# forge-layout-in-process_al8-cli-cutover — Thin client + delete waiters

**Status:** draft  
**Plan:** [forge-layout-in-process](../plans/forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** 4.5 medium for the client; 4.6 for deletions.

## Goal

`forge layout <name>` loads the profile, starts ApplyLayout, streams
Progress, waits Done. Delete the Python poll apply body. Close IC4
as skipped.

## Acceptance

- [ ] Live `_forge-test-*` apply PASS on the new path (not personal
      `dev` / `t1`) before deleting Python waiters
- [ ] Client: resolve profile, optional gdisplays / SettingsLoad,
      `ApplyLayout`, stream phase lines, map Ctrl+C →
      `CancelLayoutApply`, write `applyId` into D021 status
- [ ] Default = new path; `FORGE_LAYOUT_LEGACY=1` only while
      comparing, then **deleted in this slice**
- [ ] Deleted: GetTree poll waiters, `_layout_final_focus_pass`
      sleep, CLI LayoutBatch chrome/begin orchestration
- [ ] IC4 task closed as **skipped**
- [ ] contracts.md Settle table: CLI layout no longer waits
- [ ] `layout list|show|save` may remain Python
- [ ] Node `cli/layout.mjs` MAY land here or wait for a later CN
      facade — Python calling ApplyLayout is enough for cutover

## Context for the next agent (complete + succinct)

- Depends: AL7 live sign-off
- D021 job runner unchanged (observer)
- CN13 independent — do not block on Node PATH router
- Kill criterion: if parity fails, name the **phase** and stop;
  do not ship dual spines

## Session note

Stubbed after AL0 lock. No work yet.
