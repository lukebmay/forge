# forge-canonical-contracts

**Verdict:** pull-in-refactor
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/forge-canonical-contracts.md

## Stated status
active — design locked enough to implement; session note: IC0–IC3 done; IC4 later (superseded: skip).

## Leftovers
- IC4 fold CLI `wait_for_wm_class` + delete `FINAL_FOCUS_QUIET_MS` — **already skipped** (D037 / AL8: waiters die with the poll loop; do not spend a session polishing a deleted loop). **Close IC4**, do not reopen.
- Z0 zoom chords (FCC Wave Z on D026) — not this spine; presenter/presentation-flag later
- Session “next: live nest/logout smoke” — host verify, not a kernel slice
- Catalog still lives at `docs/dev/contracts.md`; must become (or feed) the firm-abstractions layer catalog

## Why this verdict
Option 2: this plan already tried “refine until the lines appear” (IC0–IC3) while `Node` still owns Meta/St and `WindowManager` remains the hub. Do not keep a live contracts campaign as a parallel P0. The **catalog + D024–D026 locks** are the import surface: job → named API, not a second glossary. IC4 is done-as-skip (layout-in-process closed it). Duck-tape on `tree.js`/`window.js` is not a reason to keep this spine live.

## Destination
Pull catalog into forge-firm-abstractions `layers.md` / contracts layer. Archive this spine after L0 merge (IC0–IC3 shipped; IC4 skip). Z0 stays post-refactor / presenter, not a reopen of this plan.

## Absorb
- **Catalog is law:** `docs/dev/contracts.md` job → API; new behavior extends that API first (Canonical APIs FIRM)
- D024 drop-intent: no-op iff parent + order + **layout** match; CENTER on H/V siblings is a real group op via `tree.mergeWindowsIntoGroup`
- D025 reveal: live show-group-child through `revealGroupChild`; snapshot LTF is data only
- D026 tile-slot: TILE `renderRect` is geometry authority; unsolicited Meta fs/max/size → restore; user grab-resize stays percent; Forge zoom is a presentation flag, not Meta fullscreen
- Do not add a JS GetTree `wait_until_hard_ready`; `settleTabFocus` stays chrome-only; no third settle brain
- AC1: verify remains log-only; restore is a dedicated sensor, not verify-driven reassert
- Success criteria 2–4 already shipped (R019/R020, `revealGroupChild`)
