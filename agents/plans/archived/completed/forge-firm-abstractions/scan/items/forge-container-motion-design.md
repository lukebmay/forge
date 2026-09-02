# forge-container-motion-design

**Verdict:** pull-in-refactor
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-container-motion-design.md

## Stated status
design (discussion open — no implement until locks + HTML prototype); 2026-08-27g parked proto stream for firm-abstractions planning.

## Leftovers
- MD2 operator play: adopt / revise / abandon Mark 2 for Forge (was next; now a later slice of firm-abstractions, not a live proto campaign)
- MD3 / MI1–MI3 Shell peel/move placeholders (blocked on MD2; do not keep as parallel live work)
- Open: D1 peel B lean, D6 CON+CON merge, D7 multi-select cyan, D11 shared monitors (defer), D12 empty CON in product
- Known seam: `transferLeafToMonitor` still in `src/monitors.mjs` (world + max-1 wrap) — should become TreeOps + Mark 2 wrap
- Shell still Mark 0 Move + Mark 1 C4 until explicit adopt

## Why this verdict
Option 2 already names this proto as the product kernel: `prototypes/container-motion/src/tom/` is the shared TOM; Mark 2 (`src/opsets/mark2.md` + `mark2.mjs`) is the OpSet glossary. Duck-tape on Shell `tree.js`/`window.js` is not a reason to keep a live proto campaign. Shell port is a later slice of **forge-firm-abstractions**, not keep-parallel. MD2 remains a real decision but belongs on the refactor plan after kernel lift, not as a second P0.

## Destination
Absorb into forge-firm-abstractions: kernel lift from `src/tom/`; OpSet port from Mark 2; presenter adapter later. After L0 merge, park/close this spine as absorbed. Do not resume `npm start` proto desk as PRIORITY next.

## Absorb
- FIRM glossary + invariants: `prototypes/container-motion/src/opsets/mark2.md` (edit ⇒ same-effort `mark2.mjs` + tests)
- TOM stays gi-free / presenter-free; no wrap/cross-mon/join in `src/tom/` atomics
- Brake: `cd prototypes/container-motion && npm test` (144 green as of park); green + wrong desk ⇒ paint, not TOM
- New desk bug: failing case first, then fix
- Locked behaviors: mark2.md + proto README; newest CHANGELOG (D073–D078) wins
- Monitor neighbor seam: `src/monitors.mjs` `transferLeafToMonitor` → TreeOps + Mark 2 wrap
- Process/keys/prefs/cleanup order in this plan’s Mark 2 section (wrap-before-cross-mon, prune empty then unary collapse, Launch CON slot, share rescale)
- Design lineage: Shell Mark 0+1 until adopt; do not silently rewrite live Move
