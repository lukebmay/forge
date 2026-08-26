# forge-layout-r043-chrome-failsafe-chaos — Done chrome, prod failsafe, chaos slice 1

**Status:** done
**Plan:** (none)
**Branch:** master
**Updated:** 2026-08-26

## Goal

Explain R042 failed exit; prod forest failsafe; chrome until Done; Grok ⅓ click;
bounded `--dev` chaos.

## Acceptance

- [x] D071: chrome clear only at Done (not soft end)
- [x] Epoch-end force `reassertAllTabStackSlots` + post-echo heal
- [x] afterFocus single-child off-slot reassert (D069 R025-compatible)
- [x] D070: prod failsafe one structure repair; dev/`forestFailsafe:false` loud fail
- [x] D072 chaos slice 1: shuffle + delays; cocktail log; nest queue file
- [x] L0: layout-apply-run + slot + chaos tests green (62)
- [x] Tip `./install --dev` (Wayland logout for live)

## Enable / test

```bash
npx vitest run tests/unit/extension/layout-apply-run.test.js \
  tests/unit/extension/layout-apply-slot.test.js \
  tests/unit/extension/layout-apply-chaos.test.js
FORGE_LAYOUT_CHAOS=1 FORGE_LAYOUT_CHAOS_SEED=42 \
  ./scripts/forge/forge-test nested run -- forge layout:dev
```

## Session note

Thrash job exit 1 / `required TILE slot(s) not in-slot: mon1.s0` was correct
detection without recovery. Soft cleared overlay early. Grok rect-mismatch
persisted; tab click healed via R025.
