# forge-layout-in-process_al6-executor-open — Launch + map on signals

**Status:** draft  
**Plan:** [forge-layout-in-process](../plans/forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** `grok-4.6`. Do not simplify D034/D035.

## Goal

Open phase in-process: spawn + PlaceNext, wait map/windowId on Meta
signals (admit + census + title-then-class pin), residual replan.

## Acceptance

- [ ] Shared port of `open_action_to_launch_fields` / ghostty
      rewrite / chrome-family serialize (D034)
- [ ] GJS spawn + PlaceNext facade; **no** CLI-launch fallback
- [ ] Map wait uses `admitUntrackedWindows` + Meta census (D035) +
      OpenCommitManager / window-attach signals — not GetTree poll
- [ ] Title wait then class-only leftover assign (D034)
- [ ] Chrome-family opens serialized (D034)
- [ ] Residual `planReconcile` with `rolePins` / `justOpenedRoles`
- [ ] LayoutBatch: begin → opens → release-deferred → end **before**
      residual structure
- [ ] Nest/host `_forge-test-*` open path (not personal `dev`/`t1`)

## Context for the next agent (complete + succinct)

- Depends: AL5
- Today’s CLI loop: `scripts/forge/forge`
  `_layout_run_reconcile_body` + `layout_apply.wait_for_open_role_pins`
- Bags: `OpenCommitManager`, `layout-deferred-open.js`,
  `layout-batch-depth.js`
- Fail required-role miss after pin timeout; do not abort sibling
  spawns mid-loop (same as today)
- Hard/soft/focus still AL7 unless a tiny no-open wait is already
  in AL5

## Session note

Stubbed after AL0 lock. No work yet.
