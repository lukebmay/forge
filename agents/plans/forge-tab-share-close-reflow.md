# forge-tab-share-close-reflow — Tab select 1/3 + close reflow

**Status:** in progress
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-09-03
**Design:** grok-4.6 investigation (session) — D092/D093/D100

## Goal

Closing a TILE window and selecting a tab in a group that should be ~1/2
width must leave Meta frames matching Forest `paneRect`, without needing a
later DnD to “heal.”

## Acceptance

- [x] Unit: MONITOR share repair, forget-close settle, Forest slot reassert
- [x] Contracts catalog rows for close + seeded reassert + MONITOR repair
- [ ] Host: Close a TILE — siblings fill; no stuck 1/3
- [ ] Host: Tab click group that should be 1/2 — Meta ≈ 1/2 (not 1/3)
- [ ] Host: `forge tree` — no ghost WINDOW for closed client

## Context (why)

DnD heals because `runLiveForest` always: OpSet mutate → Mark 2
`settle` → `commitLayout` → `presentSeededForest` (`paneRect`).

Tab select and close skip that package:

| Path | Gap |
| --- | --- |
| Tab click → `revealGroupChild` → `reassertNodeToSlot` | Uses GObject `renderRect` / `computeSizes` (absolute percent + remainder-to-last). Two kids at `0.33` → **1/3 \| 2/3**. Forest `paneRect` renormalizes → **1/2 \| 1/2**. |
| `repairSharesAfterChildChange` | Skips `MONITOR` even when layout is HSPLIT/VSPLIT (stale vs `containingSplit` / `paneRect`). 3→2 leaves ~1/3. |
| `unmanaged` | Border/grab only — **no** Forest remove / settle / present (D100). |
| `windowDestroy` | `destroyNode` + parent repair only; **no** RuleSet settle when `agree` already ok; seeded path skips `tree.removeNode`; `paintWmForest` then idle `renderTree` (slots deferred / race). |

## Implementation slices

| Slice | What | Exit |
| --- | --- | --- |
| **S2** | `repairSharesAfterChildChange`: MONITOR + HSPLIT/VSPLIT redistributes like CON | Unit: MONITOR-direct 3→2 fills 100% |
| **S0** | Canonical `forgetHostWindow(wm, meta\|live\|id, reason)`: Forest remove → `mark2CleanupUnder` mon → `presentSeededForest` / `commitLayout(force)`. Call from `unmanaged` + `windowDestroy`. Idempotent | Close removes id; unary collapsed; slots presented |
| **S1** | Seeded `reassertNodeToSlot` / `paintRectForWindow` dest = `forestSlotRect` + gap/zoom (same as `presentWmSlots`) | Tab reveal dest matches Forest slot |
| **S3** | Seeded chrome H/V sizes from `paneRect` (or renormalize before pixel math). Do not write Forest percents from GObject | Strip + Meta same AABB |
| **S5** | Seeded chrome kids Forest-only (`collectChromeKids` must not union GObject leftovers) | Closed peer gone from strip |

**Order:** S2 → S0 → S1 → S3 → S5.

## Do not

- Dual-write Forest←GObject
- Grow `live-handle.js`
- Invent `Mark2Drop*`
- Reconnect D100 idle TILE restore / entered-monitor / title→`renderTree`
- Turn tab click into full `commitLayout` (raise/focus + Forest-slot reassert only)

## Contracts to extend

| Job | API |
| --- | --- |
| Close / unmanage TILE | **new** → `forgetHostWindow` |
| Restore TILE to paint target | `reassertNodeToSlot` dest = `forestSlotRect` when seeded |
| H/V share after child change | `repairSharesAfterChildChange` includes MONITOR H/V |

## Session note

2026-09-03 — S2→S0→S1→S3→S5 landed on master (no commit).

- **S2:** `repairSharesAfterChildChange` redistributes MONITOR H/V like CON;
  TABBED/STACKED MONITOR still skipped. `tests/unit/tom/sizing-repair.test.js`.
- **S0:** `forgetHostWindow` in `adapter-destroy.js` — Forest remove →
  `mark2CleanupUnder` mon → GObject `removeChild` (absent-Forest allow in
  live-compat) → `commitLayout(force)`. Wired from `unmanaged` +
  `windowDestroy`. Idempotent. WM method + barrel export.
- **S1:** `forestSlotPaintRect` (tom-live) = paneRect+gap+zoom; used by
  `presentWmSlots`, `paintRectForWindow`, `reassertNodeToSlot` when seeded.
- **S3:** seeded `computeSizes` renormalizes percents (0.33+0.33 → 50/50)
  and `skipWriteBack` so Forest percents are not written from GObject.
- **S5:** `collectChromeKids` Forest-only when seeded.

**Orchestrator follow-up:** `forgetHostWindow` owns focus restore
(snapshot before Forest unlink) so unmanaged-before-destroy does not
lose sibling ids; seeded `windowDestroy` skips a second restore.

Host close/tab 1/2 verify still open. Proto brake not required (no
OpSet change). G8n-s0 next.

`WindowManager-insert-slot-split` same-axis DnD failures on this tree
look like in-flight Mark 2 pointer (`_commitResolvedDrop` removed),
not this close-reflow slice.
