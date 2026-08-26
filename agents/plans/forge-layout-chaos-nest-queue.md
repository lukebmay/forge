<!-- migrated from agents/tasks/forge-layout-chaos-nest-queue.md by agents migrate-layout -->

# forge-layout-chaos-nest-queue — AI nest TODOs for layout chaos cocktails

**Status:** ready (living queue)
**Plan:** (none)
**Branch:** master
**Updated:** 2026-08-26

## Goal

When `FORGE_LAYOUT_CHAOS=1` (or ApplyLayout `flags.chaos`) runs, every cocktail
is logged (`layout-chaos cocktail seed=…`). Append a row here for each cocktail
that fails forest-match / thrash / tip eyes-on so nest can replay until green.

## Enable

```bash
./install --dev
FORGE_LAYOUT_CHAOS=1 FORGE_LAYOUT_CHAOS_SEED=<seed> \
  ./scripts/forge/forge-test nested run -- forge layout <profile>
# or host (not default daily driver):
FORGE_LAYOUT_CHAOS=1 forge layout:dev
```

Slice 1 strategies (each randomly on/off): `launch-order`, `inter-group-delay`.

## Queue

| Seed | Strategies | Delays | Repro | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| *(append on failure)* | | | `FORGE_LAYOUT_CHAOS=1 FORGE_LAYOUT_CHAOS_SEED=… forge-test nested run -- forge layout …` | open | |

## Acceptance per row

- [ ] Nest replay with same seed reproduces
- [ ] Primary-path fix (not prod failsafe-only)
- [ ] Row marked done with tip/commit

## Session note

2026-08-26: Slice 1 landed (shuffle + delays). Maximize / extra-move / pre-seed
= later slices. Prod forest-failsafe (D070) must not be used as the “fix.”
