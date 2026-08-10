# forge-lifecycle-abstractions_d0-rate — Rate lifecycle abstractions + invent more

**Status:** ready  
**Plan:** [forge-lifecycle-abstractions.md](../plans/forge-lifecycle-abstractions.md)  
**Branch:** master (default)  
**Blocker:** (none) — **user lock** on ranking + first implement slice before code  
**Updated:** 2026-08-10

## Goal

**Discussion + inventory first** (implementation only after user lock).

1. **Examine and rate** the abstraction lines already proposed (session transcript /
   plan table L1–L9).
2. **Identify additional** useful, **testable** abstractions that improve quality,
   cut bugs, and promote reuse (not cosmetic splits).
3. **Audit `lib/extension/utils.js`** (and related shared helpers) for split /
   keep / pure-test gaps.
4. Produce a **recommended implement order**, test strategy, and explicit
   non-goals so the next agent does not thrash.

**Lens (FIRM):** size is a **symptom**. Optimize for **health**: ownership,
cleanup contracts, pure reuse, unit tests. Do **not** treat “lines removed from
`window.js`” as the success metric.

**Priority (FIRM):** this work is **ahead of further Wayland RC / live matrix
campaigns**. Keep nest stop FIRM if any nest is touched; do not expand Wayland
testing as the main track until D0 is locked and early pure slices land (or the
user reprioritizes).

## Context (from prior session)

Provisional candidates (rate these; rewrite ranks):

| ID | Idea | Why it might matter |
| --- | --- | --- |
| L1 | `sources.js` / SourceBag | Ad-hoc GLib ids + hand clear list in disable |
| L2 | `signals.js` / SignalBag | Connect arrays; missed disconnect (dialogs etc.) |
| L3 | Lifetime = sources+signals dispose | One cleanup contract |
| L4 | Per-window attach (WeakMap) | Meta signals + stack timeout + borders |
| L5 | Suppress tokens (try/finally) | Stuck `_suppress*` flags |
| L6 | Heuristics HQueue (rolling N) | Duplicated with CLI settle-heuristics |
| L7 | Catalog pure façade / seed load | `AppThrashCatalog` already exists — thin, not replace |
| L8 | OpenCommit manager | Quiet schedule block in WM |
| L9 | `utils.js` domain split | rect, grab, mon/ws, drop zones, gnome |

Existing partials to **reuse**, not reinvent:

- `disconnectSignals`, `_clearTimeoutId` in `window.js`
- `glibSchedule` / `glibCancel` in `layout-controller.js`
- `app-thrash-catalog.js` + `layout-open.js` open quiet pure
- `scripts/forge/settle_heuristics.py` + unit tests
- Manager extract pattern (Focus, DnD, session-layout-restore, monitor-recovery)

Also note: failed cold layout can leave FLOAT + placeholders; self-heal is product
spine work — **out of D0 scope** unless it needs a pure helper (e.g. thrash
detect). Lifecycle bags still help disable/destroy correctness.

## Agenda

### 1. Rate each L1–L9

For each candidate fill:

| Field | Content |
| --- | --- |
| **Impact** | Bugs prevented / reuse / clarity (H/M/L) |
| **Testability** | Unit ease (H/M/L) |
| **Cost / risk** | Wire risk to Shell; scope creep |
| **Depends on** | Other L* |
| **Verdict** | do-now / do-next / defer / reject + why |

### 2. Invent more (required)

Scan at least:

- `lib/extension/window.js` (disable, track/destroy, suppress flags, queueEvent)
- `lib/extension/tree.js` (if cleanup/duplication)
- `lib/extension/utils.js` + `lib/shared/*` pure candidates
- Duplicate math: thrash catalog ↔ settle_heuristics.py
- Any “copy-paste cleanup” or “must remember finally” sites

Propose **L10+** only if **testable** and not a rename-only split. Examples to
consider (accept or reject with reason): event queue ownership, place-hint
lifecycle, layout-batch depth as state machine, render/commitLayout policy table.

### 3. utils.js inventory

- Cluster exports by domain
- What already has unit tests vs none
- Recommend: keep one file / split into N pure modules / move drop-zones to existing
  `drop-zones.js` etc.
- Prefer **move tests with code**

### 4. Test strategy

- List pure modules + first test files
- Golden cases for heuristics (JS/CLI parity)
- Fake GLib inject pattern
- Optional CI grep later (no bare `timeout_add` outside sources) — note only

### 5. Implement order + first slice

Recommend:

1. First pure PR after lock (smallest high-testability win)
2. First wire PR (who owns SourceBag first)
3. What stays parked (Wayland RC, nest isolation D0, STACKED)

## Acceptance

- [ ] Rating table for L1–L9 complete (verdicts + why)
- [ ] At least **2 additional** candidates considered (accepted or rejected)
- [ ] utils.js inventory + recommendation
- [ ] Test strategy written (unit-first, concrete paths)
- [ ] Recommended order + **first implement slice** named
- [ ] **User lock** recorded (or explicit defer) before coding
- [ ] HANDOFF/PRIORITY still point here until lock + next task filed

## Out of scope for D0

- Implementing SourceBag/SignalBag/HQueue (file follow-up tasks after lock)
- Full Wayland RC suite runs as main work
- Nest isolation implementation (discussion task remains separate)
- Window.js rewrite

## Session note

- Created 2026-08-10 from operator direction: prioritize healthy abstractions
  over symptom size and over continuing Wayland testing for now.
