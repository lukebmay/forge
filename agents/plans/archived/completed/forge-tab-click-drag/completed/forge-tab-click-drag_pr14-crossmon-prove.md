# forge-tab-click-drag_pr14-crossmon-prove — Cross-mon / foreign prove

**Status:** done (unit prove; host eyes-on residual)
**Plan:** [forge-tab-click-drag](../../forge-tab-click-drag.md)
**Branch:** master (default)
**Blocker:** (none)
**Updated:** 2026-08-17
**Priority:** P1
**Depends:** PR13
**Agent:** Grok 4.5 med · prove

## Goal

Prove cross-mon / foreign paths that were unreachable while peel was blind.
Not a new engine — D044 move-then-join + empty-mon + foreign spacer.

## Acceptance

- [x] Unit: peel → parked pointer + event coords over other mon CENTER → join on dest
- [x] Unit: foreign-strip join-at-index still green
- [x] L0 full PR suite green
- [ ] Nest `--monitors=2` interactive peel (optional; XTEST forbidden) — host eyes-on
- [x] No spanning chrome; no second DnD engine
- [x] No commit/push unless asked

## Context

PR13 unblocked peel. Existing DnD comprehensive cases + PR13 chipFloating /
synthetic pointer assert on cross-mon peel CENTER. Nest dual skipped (no
XTEST); host after install/logout is the live authority.

### Host checklist (after `./install` + logout)

1. Same-mon: drag tab — gap == chip; remaining no overlap (PR12)
2. Peel south — chip follows; five-zones on another TILE; edge/CENTER place (PR13)
3. Dual-mon: peel to other mon empty / other group strip → join or empty-mon (PR14)
4. Along-strip only still REORDER (intentional)

## Session note

**2026-08-17:** Unit prove done. Cross-mon peel CENTER asserts chipFloating +
event coords with parked `setPointer`. Host eyes-on after tip load.
