# forge-open-min-tab-walk-float

**Verdict:** close
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-open-min-tab-walk-float.md

## Stated status
(no status header) — policy plan; shipped as D049 open-min +
`open-min-place.js`

## Leftovers
- Fail-open “unknown mins → split” in this file is **superseded** by D049
  always-on env floor
- No remaining implement

## Why this verdict
Lens: D049 / min-size-floor already keep BFS/float policy. Live APIs:
`resolveOpenMinPlacement` / `bfsOpenMinTabCandidates` in
`lib/extension/open-min-place.js`, wired from `window.js` free-open +
late-identity TILE. Contracts row exists. Not a live duck-tape plan.
Import open-policy onto the kernel (Absorb); do not re-implement on
`trackWindow`.

## Destination
archive → `agents/plans/archived/completed/forge-open-min-tab-walk-float.md`

## Absorb
- Free open/launch only: illegal split → BFS same-mon tab that fits →
  else float (`addFloatOverride`)
- **Not** PlaceNext / ApplyLayout pins; **not** DnD (DnD still refuse)
- Tiny-pane QoL stays a separate earlier-tab setting (D049 L7)
- Same-monitor BFS only (D044 mon-local); no class-wide float rule
- Env floor always applies — do **not** restore fail-open unknown mins
