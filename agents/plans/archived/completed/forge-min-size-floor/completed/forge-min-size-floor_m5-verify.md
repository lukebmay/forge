# forge-min-size-floor_m5 — L0 + nest + host tiny-env Nautilus prove

**Status:** done (agent); human eyes-on open
**Plan:** [forge-min-size-floor](../forge-min-size-floor.md)
**Branch:** master
**Blocker:** [soft](../../blockers/d049-tiny-env-nautilus.md) host tiny-env Nautilus
**Updated:** 2026-08-19
**Model:** 4.5

## Goal
L0 + nest + host tiny-env Nautilus prove per plan locks L1–L8 / D049.

## Acceptance
- [x] Matches plan slice M5 (agent: L0 + nest)
- [x] Session note when done
- [ ] Human tiny-env Nautilus (soft blocker)

## Context for the next agent
Agent verify PASS. Do not reintroduce shrink-probe. Human soft blocker owns eyes-on.
Optional later: CN14/CN15 · yuiop.

## Session note

**2026-08-19 M5 agent done. No commit/push.**

### L0
```
npm test -- tests/unit/shared/min-tile-size.test.js \
  tests/unit/extension/drop-intent.test.js \
  tests/unit/extension/open-min-place.test.js \
  tests/unit/window/WindowManager-open-app-policy.test.js \
  tests/unit/window/WindowManager-drag-drop.test.js \
  tests/unit/window/WindowManager-overflow-rehome.test.js
→ 135 passed
```
`rg` probe symbols under `docs/` + `lib/` empty.

### Nest
```
./install --kit=vim
./scripts/forge/forge-test nested run --monitors=1 -- \
  bash -lc 'forge ping; env FORGE_JOB=0 forge layout _forge-test-clean'
→ ping ok (apiVersion 10); layout: ok; EXIT 0
./scripts/forge/forge-test nested status → running: False
```
Nest shell.log: no `minProbe` / `_forgeMinProb` / `ensureWindowMinSizeKnown`.

### Human (remaining)
Soft blocker: [d049-tiny-env-nautilus](../../blockers/d049-tiny-env-nautilus.md) —
logout once; session `FORGE_MIN_TILE_*=1`; Nautilus short-pane prove.
