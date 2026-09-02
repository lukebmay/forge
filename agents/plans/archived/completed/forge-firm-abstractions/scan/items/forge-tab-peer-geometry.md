# forge-tab-peer-geometry

**Verdict:** pull-in-refactor
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-tab-peer-geometry.md

## Stated status
Accepted (FIRM lock) — D069, 2026-08-24.

## Leftovers
- Host tip: Chrome+Grok left tab — open leaf full slot without click (unchecked)
- Allowed optimization D (visible sync; bury peers only on idle) — implement only if measured need; not kernel

## Why this verdict
D069 is a **Presenter constraint**, not a TOM rule and not a live implement campaign. Option 2: shared slot + visible-first heal belong in the presenter/apply layer (`processTabbed`/`processStacked`, `reassertAllTabStackSlots`, post-echo heal). Do not reopen as a Shell duck-tape plan. Host tip is a verify of the lock, not a reason to keep PRIORITY next beside the kernel.

## Destination
Named constraint on forge-firm-abstractions presenter/import map. Archive this spine after L0 merge (lock lives in design.md + contracts). Host tip → PRIORITY parked post-refactor (host verify), not a new implement plan.

## Absorb
- Every TILE peer in TABBED/STACKED shares one content rect; Meta frames match within ε after commit
- Size on join and when the **group slot** moves/resizes (`commitLayout` → render/apply → `reassertAllTabStackSlots` + post-echo). Tab click is not the primary size path
- `revealGroupChild`: open leaf + raise; R025 reassert of revealed child only is a safety net. Do not reassert all peers from `updateTabbedFocus`/`afterFocus`
- Visible-first: open leaf (`lastTabFocus`) before buried mapped peers in the same commit; buried ≠ withdrawn
- Verify mismatch stays diagnostic (AC1); no shrink-probe; no focus-path all-peer reassert
- Approach C accepted; A/B rejected; D allowed optimization only with a note if measured
- Related: D025 reveal, D026 TILE slot, D043 CON chrome, D044 mon-local groups — stay product strategy unless import map says otherwise
