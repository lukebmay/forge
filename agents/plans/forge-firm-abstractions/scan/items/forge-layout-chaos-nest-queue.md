# forge-layout-chaos-nest-queue

**Verdict:** post-refactor
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-layout-chaos-nest-queue.md

## Stated status
ready (living queue) — table empty (`*(append on failure)*`)

## Leftovers
- Living nest TODO list for failed chaos cocktails (currently empty)
- Later chaos slices: maximize / extra-move / pre-seed
- Per-row: nest replay, primary-path fix (not D070 failsafe-only)

## Why this verdict
Empty living harness, not a kernel blocker. Option 2: do not hunt
cocktails on old `layout-apply-*.js` as P0. Keep the **queue + D072
opt-in chaos** as a post-import test surface. Not keep-parallel: no
open failures; chaos can wait until TOM apply is the path under test.

## Destination
PRIORITY parked — living harness after kernel/import (not refactor-blocking)

## Absorb
- D072: `FORGE_LAYOUT_CHAOS=1` / `flags.chaos` + `FORGE_LAYOUT_CHAOS_SEED`;
  slice 1 `launch-order` + `inter-group-delay`; always log cocktail;
  off unless env/flag (`./install --dev` must not chaos daily driver)
- D070 forest-failsafe must **not** count as the cocktail fix
- Queue format: seed / strategies / delays / nest replay command
