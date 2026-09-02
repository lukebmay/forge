# forge-min-size-floor

**Verdict:** close
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-min-size-floor.md

## Stated status
shipped (agent) — M1–M5 agent done; soft human tiny-env open verify

## Leftovers
- Soft human tiny-env Nautilus prove (blocker d049-tiny-env-nautilus)
- Plan L1 text still says 320×240; **code + CHANGELOG D049 = 256×144**
  (`lib/shared/min-tile-size.js`)

## Why this verdict
Agent M1–M5 shipped; D049 CHANGELOG **shipped**. Soft host verify is not a
live implement plan. Do not keep duck-tape on `window.js`/`tree-layout.js`.
Import D049 mins policy onto the kernel (Absorb). Newest lock wins:
**256×144**, not the plan’s 320×240.

## Destination
archive → `agents/plans/archived/completed/forge-min-size-floor.md`

## Absorb
- D049 L1–L8 as product (CHANGELOG): env floor unset → **256×144**;
  `FORGE_MIN_TILE_WIDTH` / `FORGE_MIN_TILE_HEIGHT`; no gsettings
- **No shrink-probe** (delete inventory stays deleted)
- Passive learn only: clamp vs request + oversized frame vs slot →
  `window-mins.json` class floor
- Overflow: BFS same-mon tab → float + remove vacated gap
- DnD red/refuse uses effective mins (hints ∪ known ∪ class ∪ floor)
- ApplyEpoch / PlaceNext pins excluded (no retarget)
- Tiny-pane QoL stays separate
- Prove recipe (post-import host, not a live slice): tiny env floors,
  Nautilus clamp-learn, red zones, BFS/float, zero probe journal
