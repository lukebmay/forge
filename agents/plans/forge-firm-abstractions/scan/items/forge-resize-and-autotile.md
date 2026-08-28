# forge-resize-and-autotile

**Verdict:** post-refactor
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-resize-and-autotile.md

## Stated status
Discussion / draft (no implement until product lock). Scope cut 2026-07-31: structural resize lives on FCC Wave R; this spine is ratio-step (yuiop) + optional auto-tile.

## Leftovers
- D0 human lock: yuiop meaning (relative vs parent ppt vs snap targets), mod chord vs Safe kit edge y/u/i/o, CLI verbs
- Auto-tile shortlist (BSP / master–stack / grid / spiral / largest-empty) — not locked
- R1/R2 CLI + vim-kit keybinds; A0/A1 optional algo spike
- Tabbed/STACKED: resize the CON against its split pair, not a leaf in the bag (stated lean, not shipped)

## Why this verdict
Not kernel. Option 2 TOM/OpSet/presenter does not need yuiop sugar or auto-tile algorithms to lift. Needs a **human design lock** (open blocker `resize-autotile-design`). Do not duck-tape onto `tree.js`/`window.js`. Keep as real product work **after** kernel/import. Structural resize (owning-split edge, Size vs Resize naming) is FCC Wave R — absorb only if that Wave is still live; do not reopen it here.

## Destination
PRIORITY parked post-refactor, gated on the design blocker. Do not start R1/A0 this meeting. Pair with `blocker-resize-autotile-design`.

## Absorb
- Existing surfaces to not break: `window-reset-sizes`, `window-golden-ratio`, pixel expand/shrink, Safe kit edge y/u/i/o
- Axis = parent CON split (H=width, V=height); nested expand against pair
- Bag resize = container vs split pair (same as mouse)
- Unrelated to `forge-layout-sizes` (custom share preserve)
- CLI sketch: `forge size equal|grow|shrink|set|double` — verbs only; lock later
