# forge-lifecycle-abstractions_d0-rate — Rate lifecycle abstractions + invent more

**Status:** done  
**Plan:** [forge-lifecycle-abstractions.md](../plans/forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Lock:** **LOCKED** 2026-08-10 (operator: agent may decide; decisions below)

## Goal

**Discussion + inventory first** (implementation only after user lock).

1. **Examine and rate** the abstraction lines already proposed (plan table L1–L9).
2. **Identify additional** useful, **testable** abstractions.
3. **Audit `lib/extension/utils.js`** for split / keep / pure-test gaps.
4. Produce **implement order**, test strategy, non-goals.

**Lens (FIRM):** size is a **symptom**. Health = ownership, cleanup contracts, pure reuse, unit tests.

## Lock decisions (authoritative)

| Decision | Value |
| --- | --- |
| First pure slice | **L1 SourceBag** + unit tests |
| Second pure slice | **L6 settle-math kernel** (shared rolling max×pad floor/cap) + JS↔CLI golden cases for that formula only |
| First wire owner | **Open-commit timers** → SourceBag (already injects schedule/cancel) |
| Then wire | WM global named sources on disable; LC may re-export schedule from `sources.js` |
| L2 SignalBag | Pure after L1; wire before L4 |
| L3 Lifetime | Thin compose of L1+L2 — do not invent DI framework |
| L4 Per-window attach | After bags proven |
| L5 Suppress tokens | Small pure; wire opportunistically |
| L7 Catalog | **No rewrite** — catalog may call L6 kernel only |
| L8 OpenCommit manager | After SourceBag wire (optional extract once bag-backed) |
| L9 utils split | **Deferred** — keep one file |
| L10 EventQueue + drain source | Accept; after SourceBag (drain uses bag) |
| L11 Batch-depth pure | Accept small pure anytime after L1 |
| L12 Place-hint bag | Reject for now (already pure + tested) |
| L13 Render policy table | Reject / later product |
| L14 Epoch suppress | Fold into L5 |
| Product spine / self-heal / FLOAT hard-ready | **Out of this plan** — separate product work; bags do not block or replace it |
| Larger arch first? | **No** — see plan § Architecture (what is *not* a pre-req) |

### Implement order (locked)

```text
Pure:  L1 SourceBag → L6 settle-math kernel → L2 SignalBag → L3 Lifetime → L5 suppress → L11 batch-depth (optional)
Wire:  open-commit → WM/LC global sources → L4 per-window attach → L8 manager extract (optional) → suppress sites
Defer: L7 rewrite, L9 utils split, place-hint bag, Wayland RC, nest isolation, STACKED
```

### SourceBag API (locked intent)

- Injectable `schedule` / `cancel` (default GLib timeout; idle support in v1 or v1.1).
- Named slots: `set(name, delayMs, cb)` replaces prior id for that name; `cancel(name)`; `cancelAll()` / `dispose()`.
- Leak criterion: after dispose, fake registry has zero live ids.
- Home: `lib/extension/sources.js`; move `glibSchedule`/`glibCancel` here; LC re-exports or imports.

## Rating summary (L1–L9)

| ID | Verdict | Why |
| --- | --- | --- |
| L1 SourceBag | **do-now** | H impact, H test, low pure risk; disable checklist disease |
| L2 SignalBag | **do-now pure / next wire** | Missed-disconnect class; expand disconnectSignals |
| L3 Lifetime | **do-next** | Thin glue only |
| L4 Per-window attach | **do-next** | Real destroy path; needs L2 |
| L5 Suppress tokens | **do-next** | Small pure; stuck-flag class |
| L6 settle-math kernel | **do-now pure** | Shared formula; **not** product merge of thrash vs CLI soft |
| L7 Catalog façade | **thin/defer** | Catalog stays; call kernel |
| L8 OpenCommit mgr | **do-next** | Pure policy already in layout-open.js |
| L9 utils split | **defer** | Already tested; nav-only ROI |

## Invented (L10+)

| ID | Verdict |
| --- | --- |
| L10 EventQueue + owned drain | Accept after SourceBag |
| L11 Batch-depth pure | Accept small |
| L12 Place-hint bag | Reject now |
| L13 Render policy table | Reject / later |
| L14 Epoch → L5 | Merge |
| L16 Golden fixtures for L6 | Accept as tests |

## utils.js

**Keep one file.** Clusters: rect, grab, drop (re-export), mon/ws, gnome compat. Split only after bags if navigation pain remains; move tests with code.

## Test strategy

| Module | Tests |
| --- | --- |
| `sources.js` | `tests/unit/extension/sources.test.js` — inject fake GLib, replace slot, cancelAll leak-free |
| settle-math | JS unit + golden parity rows with `test_settle_heuristics.py` for shared formula only |
| `signals.js` | fake target, groups, dispose-after-finalize |
| suppress | nested + throw restores |
| OpenCommit wire | later; layout-open pure already green |

## Acceptance

- [x] Rating table for L1–L9 complete
- [x] ≥2 additional candidates (L10, L11, L12 reject, L16)
- [x] utils.js inventory + recommendation
- [x] Test strategy written
- [x] Order + first slice named
- [x] **User lock** recorded (agent authorized 2026-08-10)
- [x] Next task filed: A1 SourceBag
- [x] HANDOFF/PRIORITY updated for post-lock

## Out of scope for D0

- Implementation (→ A1+)
- Full Wayland RC / nest isolation
- Window.js rewrite

## Session note

- 2026-08-10: D0 analysis complete; operator approved direction and authorized agent lock.
- Larger architecture: **nothing must block L1** — see plan. Product spine (self-heal, dual-mon cold) remains separate queue after pure health slices.
- Next: [forge-lifecycle-abstractions_a1-source-bag.md](./forge-lifecycle-abstractions_a1-source-bag.md)
