# forge-layout-cold-apply-structure — Cold ApplyLayout structure + soft (R036)

**Status:** in progress  
**Plan:** (none) · residual of AL6/AL8 open + R033 aspect + R035 ensure  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-16  
**Regression:** [R036](../REGRESSIONS.md)

## Goal

True-cold Wayland host `forge layout dev` exits **ok** with topology matching
the profile (not nested mon0 aspect thrash; mon1 multi-role tabs co-grouped),
soft settle finishes without max-corrections, verify structure+focus.

## Acceptance

- [x] Root confirmed in code (PlaceNext mon-root only → OP1/D032 thrash; PH
      `get_workspace` throw; residual ensure can fix mon1 mid-session)
- [x] Cold multi-open PlaceNext pins to layout PH (not mon-root only); pin
      attach skips OP1 aspect / D032 wrap
- [x] Layout placeholders: `get_workspace` stub + skip in `windowHomeReconcile`
- [x] ApplyLayout **beltStructure** after pin-role belt moves (R013 port; AL8
      dropped CLI path) so mon1 TABBED survives rehome
- [x] Unwrap mon-direct 1-child H/V after order/size (lone VSPLIT around term)
- [ ] `forge layout dev` **cold after logout** tip: mon0
      `TABBED(chrome,Grok) | ghostty`; mon1
      `ghostty | TABBED(YouTube,Gmail,Voice)`; exit 0
- [ ] Soft settle: no `soft focus: max corrections (32)` on that path
- [x] L0: PH pin + beltStructure partition/rebind + open-app-policy (123 related)
- [x] Nest: mon0 unwrap after dual open (ghosttys); chrome open-miss nest flake
- [ ] Host: cold re-verify after install + **logout** tip
- [ ] Optional: CLI “nothing applied” wording — parked [IDEAS](../IDEAS.md)

## Context for the next agent (complete + succinct)

### Live 2026-08-16 (fresh logout, tip dirty with R036 pin only)

| Fact | Detail |
| --- | --- |
| Cold job | `20260816T052835Z-a3152f` **ok** soft=3 verify match — tree wrong |
| Actual cold tree | mon0 `TABBED \| VSPLIT(ghostty)`; mon1 **flat** 4-wide |
| Mid-session | order ensure mon1 TABBED; mon0 VSPLIT remained |
| Root A | PlaceNext mon-root / OP1 thrash (partial pin) |
| Root B | **ApplyLayout missing R013 beltStructure** after belt 4 mon moves |
| Root C | Lone mon-direct VSPLIT never unwrapped |

### Code fix (in tree, installed dirty; host needs **logout**)

| Path | Change |
| --- | --- |
| `lib/shared/layout-open.js` | `findLayoutPlaceholderId` |
| `lib/extension/layout-apply-open.js` | PlaceNext `id:<ph>` from forest |
| `lib/extension/window.js` | pin skip D032; PH rehome skip |
| `lib/extension/layout-placeholder.js` | `get_workspace` stub |
| `lib/extension/layout-apply-settle.js` | `runBeltStructureRebind` + partition |
| `lib/extension/layout-apply-run.js` | after belt moves → beltStructure; unwrap after order/size |
| `lib/extension/session-api.js` | `_unwrapMonDirectSingleChildSplits` |

### Verify

```bash
npm test -- tests/unit/extension/layout-apply-settle.test.js \
  tests/unit/shared/layout-open.test.js \
  tests/unit/extension/layout-apply-open.test.js \
  tests/unit/extension/layout-placeholder.test.js \
  tests/unit/window/WindowManager-open-app-policy.test.js
./install --kit=vim
# Host cold (required for tip):
#   log out and back in, then:
forge layout dev
forge tree
# mon1: ghostty | TABBED(YouTube,Gmail,Voice)
# mon0: TABBED | ghostty (not VSPLIT wrap)
```

## Session note

2026-08-16 later: Host cold after logout still wrong (job a3152f). Diagnosed
missing ApplyLayout beltStructure (R013 CLI-only) + mon-direct unwrap. Nest
dual mon0 unwrap PASS. Host needs one more logout for tip + cold sign-off.
