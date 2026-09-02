# forge-enable-ding-percent-thrash

**Verdict:** close
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-enable-ding-percent-thrash.md

## Stated status
agent done — host verify after `./install --dev` (+ logout or disable/enable)

## Leftovers
- Soft host verify: `layout:dev` → disable → enable → Ghostty ~½ / childPctSum ~1
- No remaining implement on the live tree

## Why this verdict
Option 2: agent-done with only host verify is not a live implement plan.
DING admit-time ignore + sibling-share renormalize already landed in
`float-reason.js`, `window.js`, `tree.js`, `session-layout.js` (unit
coverage in `float-reason.test.js` / `tree-snapshot.test.js`). Do not
keep a duck-tape follow-up on `tree.js`. Import the **strategy** on the
new kernel (Absorb). Soft verify is not P0.

## Destination
archive → `agents/plans/archived/completed/forge-enable-ding-percent-thrash.md`

## Absorb
- Admit-time ignore: DING / desktop-icon surfaces never enter the TILE
  forest (`isDingDesktopIconsSurface` in `lib/shared/float-reason.js`;
  `WindowManager.isWindowIgnored`; `config/windows.json` ignore rule)
- Session portable save/restore drops DING and renormalizes sibling
  shares (`session-layout.js`)
- Monitor `removeNode` scales remaining shares via
  `renormalizeChildPercents` — never `resetSiblingPercent` wipe
- `cleanTree` DING-only (not all `gjs`)
