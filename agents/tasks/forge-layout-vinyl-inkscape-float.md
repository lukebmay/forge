# forge-layout-vinyl-inkscape-float — vinyl WS2 Inkscape FLOAT hard-fail + apply chrome UX

**Status:** in progress (D051 landed; host tip verify open)
**Plan:** (none)
**Branch:** master
**Blocker:** (none) — soft host eyes-on after tip load
**Updated:** 2026-08-22

## Goal

Make `forge layout vinyl` land Inkscape TILE in-slot on mon0 (WS2), and update
apply chrome: no timed “first apply slow” note; show settle jitter / soft-fail
notices; `./install --dev` stage checklist on the modal. Also: sole-monitor
TILE maximize snaps back when maximize-on-single is off (Inkscape purple border).

## Acceptance

- [x] Late adopt / `_ensureTiledForSlotPlace` / `ensureMetaInSlot` (named APIs)
- [x] Chrome UX (D043): no timed first-apply hint; jitter/soft; dev stages
- [x] Lone Meta-max D026 exemption gated on `window-maximize-on-single`
- [x] **D051:** Meta `allows_resize` false while max/fs ≠ permanent `no-resize`
      (host vinyl job `…T224233Z-f105e4` + lone Nautilus: TILE→FLOAT `no-resize`)
- [x] L0 float-reason + floating + dyt2 (+461) green
- [ ] Host: logout tip; `forge layout vinyl` on WS2; sole maximize snaps to purple TILE

## Context for the next agent (complete + succinct)

### Evidence (post prior tip)

Vinyl `…T224233Z-f105e4` hard-failed `mon0.inkscape`. Late adopt:
`floatAction=float floatReason=no-resize` (Inkscape maxed → Meta
`allows_resize=false`). Lone Nautilus maximize bursts:
`TILE→FLOAT reason=no-resize` then later `FLOAT→TILE` — D026 never saw TILE.

Prior late-adopt/lone-max gates were valid but defeated by this gatherer quirk.

### Fix paths

- `lib/shared/float-reason.js` — `allowsResizeForFloatPolicy` (D051)
- `lib/extension/window.js` — gatherer uses it
- Meta mock: `allows_resize()` false while max/fs (tests catch regress)
- Docs: D051 · contracts · troubleshooting

### Verify

```bash
npm test -- tests/unit/shared/float-reason.test.js \
  tests/unit/window/WindowManager-floating.test.js \
  tests/regression/bug-dyt2-lone-maximize-preserved.test.js
./install --dev
# Wayland logout once, then WS2:
forge layout vinyl
# sole Nautilus maximize should snap + keep purple
rg 'hunt:tile-slot-float|no-resize|Inkscape|Nautilus TILE' ~/.local/state/forge/forge.log | tail -40
```
