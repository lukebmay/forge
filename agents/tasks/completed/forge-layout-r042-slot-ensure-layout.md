# forge-layout-r042-slot-ensure-layout — Hard-retry ensure_layout for same-mon tab peel

**Status:** done
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-26

## Goal

Fix Wayland `forge layout dev` thrash: Chrome already open → settle jitter → mon1
three columns (Voice as MONITOR sibling outside TABBED) instead of ghostty | tab.

## Acceptance

- [x] Diagnose via plog session `tKceM` + live `forge tree`
- [x] `placeSlotWindows` runs slot-local `ensure_layout`/`ensure_order` on hard retry
- [x] Meta hollow `ensureMetaInSlot` only when replan has no structure for that slot
- [x] L0 regression test R042
- [x] REGRESSIONS R042 row

## Context for the next agent

- **Symptom:** mon1 = ghostty | TABBED(YouTube,Gmail) | Voice; hard-ready why
  `parentLayout=HSPLIT→TABBED,parentType=MONITOR→CON`; hollow → ensure-meta ×2;
  chrome clear `all-hard`.
- **Cause:** replan marks same-mon windows `reused` (0 moves) but emits
  `ensure_layout mon1.s0`; slot place filtered moves only → Meta reassert cannot
  reparent into TABBED.
- **Fix:** `lib/extension/layout-apply-slot.js` `placeSlotWindows`.
- **Mid-session repair without tip:** current thrased desk already plans
  order-phase ensure_layout — `forge layout dev` again on old tip can regroup.
- **Tip for open-path R042:** `./install --dev` then Wayland logout or nest restart.
- **Enable/test:** `npx vitest run tests/unit/extension/layout-apply-slot.test.js`

## Session note

Host fresh Wayland; Chrome opened first for networking; then `layout:dev`.
Place-hint races (YouTube/Gmail stole ghostty provisional claims) then Voice
confirmed into CON, later under MONITOR. Hard retry could not structure-repair.
