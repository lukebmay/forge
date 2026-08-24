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
- [x] Host: `./install --dev` + tip reload; WS2 Inkscape titlebar maximize →
      full slot again after ~390ms post-echo (indigo border held full while
      frame shrank mid-echo — expected residual); session `NTJ5d`
      `d026-restore` + `post-echo-slot reassert`

## Context for the next agent (complete + succinct)

### Evidence (post prior tip)

Vinyl `…T224233Z-f105e4` hard-failed `mon0.inkscape`. Late adopt:
`floatAction=float floatReason=no-resize` (Inkscape maxed → Meta
`allows_resize=false`). Lone Nautilus maximize bursts:
`TILE→FLOAT reason=no-resize` then later `FLOAT→TILE` — D026 never saw TILE.

Prior late-adopt/lone-max gates were valid but defeated by this gatherer quirk.

**2026-08-23 host:** sole Inkscape titlebar maximize → Meta shrinks upper-left,
indigo border stays full-slot. Plogs: `minClampLearn` only (move ran); no
size-changed hunt lines — unmaximize restore-size lands **inside** command
echo (350ms) then silence. Fix: `_schedulePostEchoSlotReassert` after D026
restore + TRACE `d026-restore` / `post-echo-slot`.

### Fix paths

- `lib/shared/float-reason.js` — `allowsResizeForFloatPolicy` (D051)
- `lib/extension/window.js` — gatherer uses it; D026 post-echo slot reassert
- Meta mock: `allows_resize()` false while max/fs (tests catch regress)
- Docs: D051 · contracts · troubleshooting

### Verify

```bash
npm test -- tests/unit/shared/float-reason.test.js \
  tests/unit/window/WindowManager-floating.test.js \
  tests/regression/bug-dyt2-lone-maximize-preserved.test.js \
  tests/regression/bug-w-render-storm.test.js
./install --dev
# tip reload (logout or nest restart), then WS2:
forge layout vinyl
# sole Inkscape maximize → full slot; indigo border matches frame
forge log --grep 'd026-restore|post-echo-slot' --level trace --since 5m
```
