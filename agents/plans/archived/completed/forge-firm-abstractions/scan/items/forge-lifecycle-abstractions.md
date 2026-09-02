# forge-lifecycle-abstractions

**Verdict:** pull-in-refactor
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-lifecycle-abstractions.md

## Stated status
active — pure + W1–W5 + L8/L11 done; optional per-window signal arrays remain.

## Leftovers
- Optional: per-window `windowSignals`/`actorSignals` → WindowAttach — not blocking RC
- L7 catalog façade (thin only), L9 utils split (defer), L10 EventQueue drain via bag (accept after L1 — check if already true in wire)
- L12 place-hint bag **reject now**; L13 render policy table **reject / later** (product not lifecycle)
- Product-next “resume nest dual-mon RC” is **not** this plan — other spines own it

## Why this verdict
Bags shipped as Host lifetime primitives (`sources.js`, `signals.js`, `lifetime.js`, `window-attach.js`, `suppress.js`, `settle-math.js`, `open-commit-manager.js`, `layout-batch-depth.js`). Option 2: these are the Host layer, not a reason to keep a live “health” P0 beside the TOM kernel. The old lock “do not start a multi-session redesign before bags” is **satisfied**; the redesign is now this meeting. Optional leftover: **close** (two-meeting rule / not kernel); if Host lifetime later needs per-window SignalBag, that is a thin post-refactor slice, not this spine staying open.

## Destination
Absorb bags as Host lifetime on forge-firm-abstractions. Archive this spine after L0 merge. Optional per-window signals: close (wontfix-now); do not list on PRIORITY unless Host import hits a concrete leak.

## Absorb
- Pattern: SourceBag / SignalBag / Lifetime compose — disable/destroy = **dispose**, not growing hand lists
- Per-window attach (`window-attach.js`) + suppress tokens (`suppress.js`) — geom/above/rehome
- settle-math kernel + CLI golden parity (`settle-math.js` / `settle_heuristics.py`); L6 math only, keep product APIs separate
- OpenCommitManager owns bag + pending; fire stays on WM until Host import says otherwise
- LayoutBatchDepth pure (`layout-batch-depth.js`)
- Testing: unit + fake GLib leak (after `cancelAll`/`dispose` no residual source ids); inject schedule/cancel
- D0 rejects: L12/L13 not lifecycle; L9 keep `utils.js` one file unless split is justified
- Do not measure success as “lines deleted from `window.js`”
