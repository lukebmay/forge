# blocker-resize-autotile-design

**Verdict:** post-refactor
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/blockers/resize-autotile-design.md

## Stated status
open — severity hard / kind design / P3; RC-relevant as design only, not RC-blocking.

## Leftovers
- Human must lock: yuiop (or alternate) + mod chord vs Safe edge y/u/i/o
- Meaning of 1/3, 1/2, double (relative share vs parent ppt vs snap)
- CLI `forge size` verbs
- Pick 1–2 auto-tile algorithms for first spike
- Unblocks D0 → R1/R2/A0 on `forge-resize-and-autotile` (no implement until then)

## Why this verdict
Same as the resize plan: product sugar + optional algos, **not** TOM kernel. Option 2 does not need this lock to lift the tree. Hard severity means “do not implement without the human,” not “block the refactor.” Duck-tape on `tree.js`/`window.js` would be the wrong fix anyway.

## Destination
Keep the blocker open; PRIORITY parked post-refactor with `forge-resize-and-autotile`. Do not start D0/R1 this meeting.

## Absorb
- Safe kit edge y/u/i/o must keep working; ratio-step needs a distinct chord or letters
- Structural resize (owning-split edge, Size vs Resize naming) is **not** this blocker — FCC Wave R
- Decisions, when they land, write into `agents/plans/forge-resize-and-autotile.md` as locks
