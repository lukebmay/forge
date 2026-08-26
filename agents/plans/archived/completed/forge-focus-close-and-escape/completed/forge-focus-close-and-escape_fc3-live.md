# forge-focus-close-and-escape_fc3-live — Combined live smoke + matrix cases

**Status:** done  
**Plan:** [forge-focus-close-and-escape](../../forge-focus-close-and-escape.md)  
**Branch:** master  
**Updated:** 2026-08-09

## Goal

Catalog + harness for close-focus and unfocus so agents can re-run FC1/FC2
product behavior selectively via `forge test live`.

## Acceptance

- [x] LIVE_CASES for close-focus and unfocus (behaviors + `--from-work`)
- [x] RunSteps `unfocus` (scriptable; same as WindowUnfocus)
- [x] Live X11: close → TILE focus; unfocus → no TILE focus, LFT retained
- [x] Units for pure checks + work hints

## Context for the next agent

| Piece | Path |
| --- | --- |
| Cases | `L1.close-focus-lft`, `L1.unfocus` in `live_matrix.py` |
| RunSteps op | `unfocus` — `run-steps.js` EXTENSION_OPS + validate; `session-api._unfocusOp` |
| Runner actions | `focus-disposable-chrome`, `close-focus`, `focus-any-tile`, `unfocus` |
| Checks | `focus-is-tile`, `no-tile-focus`, `closed-gone`, `lft-retained` |
| Select | `forge test live plan --from-work close\|unfocus` |

**Live note:** close case **closes** a disposable chrome TILE; desk may need
`forge layout dev` after. Unfocus needs extension install/HUP for new RunSteps op.

## Session note

2026-08-09: X11 live PASS both cases. Close → mon ghostty TILE; unfocus →
`focusWindowId` None, LFT retained.
