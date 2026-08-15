# forge-layout-in-process_al7-executor-settle — D019 in-process

**Status:** draft  
**Plan:** [forge-layout-in-process](../plans/forge-layout-in-process.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-15  
**Agent:** `grok-4.6`. Do not add a JS GetTree poll.

## Goal

Hard-ready, focus once, soft residual, verify once, optional belt —
all inside the extension on Meta signals + existing bags.

## Acceptance

- [ ] Hard-ready: shared settled predicate; ~5s call clock; Meta
      TILE/rect/mon signals (`layout-sensors` attribution)
- [ ] Focus once: `revealGroupChild` + `pinLayoutOpenLeaf` (D018)
- [ ] Soft: `settle-math` quiet; steal → pin restore + reset quiet
- [ ] Heuristics write under `forgeConfigHome` (same file shape)
- [ ] Verify once; correct at most once
- [ ] Belt = D014 pin-role wrong-mon **moves only**
- [ ] LF6 `waitTreeStable` stays opt-in
- [ ] No function that polls GetTree / `wait_until_hard_ready` clone
- [ ] Chrome stays up through soft; clears after verify/terminal

## Context for the next agent (complete + succinct)

- Depends: AL6 (no-open hard/soft may start at end of AL5)
- Predicates today: `layout_apply.window_is_settled` /
  `focus_actions_still_needed` / `run_soft_*`
- Formula: `lib/extension/settle-math.js` (move to `lib/shared/`
  only if this slice or Node store needs it)
- Pin: `layout-open-leaf-pin.js` — already live; do not twin
- Catalog: do not add a third settle brain

## Session note

Stubbed after AL0 lock. No work yet.
