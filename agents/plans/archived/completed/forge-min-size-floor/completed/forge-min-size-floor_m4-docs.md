# forge-min-size-floor_m4 — Docs/contracts/DESIGN/HANDOFF for D049

**Status:** done
**Plan:** [forge-min-size-floor](../forge-min-size-floor.md)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-19
**Model:** 4.5

## Goal
Docs/contracts/DESIGN/HANDOFF for D049 per plan locks L1–L8 / D049.

## Acceptance
- [x] Matches plan slice M4
- [x] Session note when done

## Context for the next agent
See plan `M5` section. Product docs now match env floor + passive learn +
overflow rehome. Do not reintroduce shrink-probe. Next = M5 nest/host prove.

## Session note

**2026-08-19 M4 done (4.5). No commit/push. No M5.**

- **Docs:** DESIGN free-open/mins → D049; contracts DnD + free-open rows rewrite
  (floor always; no probe/fail-open); troubleshooting → env + `window-mins.json`
  + overflow rehome; D049 row already matched shipped product.
- **Comments:** removed probe novels in `drag-drop.js`; short *why* in
  `open-min-place.js` / `drop-intent.js` (zero-mins, not fail-open unknown).
- **HANDOFF/PRIORITY:** next = M5; historical probe shipped sections footnoted
  **superseded by D049**; prove recipe = tiny env + Nautilus passive learn.
- **Accept:** `rg 'ensureWindowMinSizeKnown|minProbe|_forgeMinProb' docs/ lib/`
  empty.
- **Next:** M5 verify (+ human tiny-env Nautilus).
