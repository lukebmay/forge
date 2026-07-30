# LF8 — Nested VSPLIT apply (open/rehome under ghostty)

**Plan:** [forge-layout-reliability.md](../../forge-layout-reliability.md)  
**Status:** done  
**Branch:** `plan/forge-layout-reliability`  
**Pri:** P0 restore correctness  
**Related:** LF7 mon-root save (different bug)

## Live repro

Profile `t1` nested `vsplit(ghostty, nautilus)` under mon0 hsplit with tab. After
close nautilus, empty VSPLIT CON remained. Apply demoted CON via mon hsplit on
ghostty and moved nautilus to mon root / wrong mon.

## Fix

1. Mon ensure anchors mon-direct only (no nested ghostty demote).
2. Nested `split` in `_slot_layout_modes` + structure repair for h/v.
3. Open/move under nested split → `destWindowId` sibling + ensure mon0.s1 vsplit.
4. Multi-id h/v ensure_layout → layout first + move rest (like tabbed).
5. `do_launch(attach_selector=…)` → PlaceNext `attachSelector` (live open join).

## Acceptance

1. [x] Dry-run: no mon0 hsplit on nested ghostty; mon0.s1 vsplit + destWindowId.
2. [x] Live `forge layout t1` after close nautilus → VSPLIT [ghostty, nautilus].
3. [x] Unit: plan + apply + save 261 passed.
4. [x] attach_selector wired (initial live fail TypeError fixed).

## Session note

**Live PASS (2026-07-29):** close nautilus → `forge layout t1` twice → mon0
`VSPLIT` kids ghostty + Nautilus. Ghostty session window preserved.
A implemented planner; orchestrator fixed `do_launch` attach_selector + live verify.
