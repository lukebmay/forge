# forge-layout-vinyl-inkscape-float

**Verdict:** close
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-layout-vinyl-inkscape-float.md

## Stated status
in progress (D051 landed; host tip verify open) — stale vs all
acceptance boxes checked, including host session `NTJ5d`

## Leftovers
- Status header still says soft host eyes-on; acceptance already records
  host vinyl + post-echo reassert
- No remaining implement

## Why this verdict
D051 + late-adopt slot APIs + D026 post-echo reassert shipped
(`allowsResizeForFloatPolicy`, `_ensureTiledForSlotPlace`,
`_schedulePostEchoSlotReassert`). Agent-done; host leftover is not a
live duck-tape plan. Do not keep vinyl Inkscape as P0 on `window.js`.
Import float-policy + slot-place strategy (Absorb). D051 stays a
product lock unless the import map supersedes it.

## Destination
archive → `agents/plans/archived/completed/forge-layout-vinyl-inkscape-float.md`

## Absorb
- D051: Meta `allows_resize` false while max/fs is **not** permanent
  `no-resize` (`allowsResizeForFloatPolicy` in `lib/shared/float-reason.js`)
- Named slot-place: `_ensureTiledForSlotPlace` / `ensureMetaInSlot`
  (late PlaceNext TILE; no LFT adopt)
- D026 lone Meta-max exemption gated on `window-maximize-on-single`
- `_schedulePostEchoSlotReassert` after D026 restore (command-echo
  unmaximize restore-size)
- Apply chrome D043: no timed first-apply hint; jitter/soft-fail notices;
  `./install --dev` stage checklist on the modal
