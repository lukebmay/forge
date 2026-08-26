# forge-layout-settle-contract_se5-open-leaf-pin — SE5 extension pin/D018

**Status:** done  
**Plan:** forge-layout-settle-contract  
**Branch:** plan/forge-layout-cold-topology  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Align layout open-leaf pin residual with soft-focus wall; keep meta-focus steal restore.

## Acceptance

- [x] `LAYOUT_OPEN_LEAF_PIN_MS` = 15000 (= SOFT_FOCUS_WALL_CAP_MS)
- [x] Pure helpers `layout-open-leaf-pin.js` + unit tests
- [x] session-api `_focusOp` uses default pin (no fixed 3500ms)
- [x] action-pipeline meta-focus steal path unit-tested
- [x] Live X11 near-cold `forge layout dev`: Grok + YouTube open leaves stick

## Context for the next agent

- Pin helpers: `lib/extension/layout-open-leaf-pin.js`
- WM: `pinLayoutOpenLeaf` / `restoreLayoutOpenLeafIfStolen`
- CLI soft barrier already re-focuses (re-pins) on each correct
- CT3: partial live green (near-cold empty→dev); full cold empty optional

## Session note

**2026-08-09:** Old 3.5s pin expired mid 6s first-ever soft trial. SE5 pins 15s.
