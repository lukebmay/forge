# forge-open-min-tab-walk-float — Free open mins → tab → float

**Status:** done  
**Plan:** (none)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-19

## Goal

When a **free** open (dock / `forge launch` without slot pin / focus LFT) would
H/V split into a size below app mins (new or dest), do not place there. Prefer
a same-monitor tab that fits (BFS from LFT); else float. DnD red+refuse and
ApplyLayout PlaceNext pins unchanged. Tiny-pane QoL stays separate (default off).

## Done in tree

- Pure `lib/extension/open-min-place.js`: `resolveOpenMinPlacement`,
  `splitWouldOverflowMins` / `tabWouldOverflowMins`, `bfsOpenMinTabCandidates`
- Wire `wm._decideOpenMinPlacement` / `_ensureTabbedForOpen` in free
  `trackWindow` + `_rehomeAttachAfterMonLft`
- Float last resort: `addFloatOverride` + skip percent / open-commit carve
- contracts.md + DESIGN note
- L0: open-min-place + open-app-policy (+ drop-intent / lft-mru)

## Acceptance

- [x] Illegal VSPLIT on tall LFT → TABBED with LFT
- [x] LFT tab too small → tab neighbor (BFS includes MONITOR siblings)
- [x] No fit → FLOAT override
- [x] PlaceNext pin not retargeted
- [x] Unknown mins fail-open to aspect split
- [x] Tiny-pane tests still green

## Context for the next agent

- Mins still fail-open until hints / class floor / learn exist (same as DnD)
- Nest eyes-on: open Nautilus onto a short focus tile with known mins → tab or
  float, not half-height split
- Do not walk PlaceNext apply pins; do not change DnD refuse

## Session note

BFS initially skipped MONITOR children (treated parent ceiling as “no
siblings”); fixed so same-head neighbors are candidates. L0 **123** green on
touched suites.
