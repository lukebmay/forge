# archive-completed-audit

**Verdict:** close
**Confidence:** high
**As of:** 2026-08-27
**Path:** agents/plans/archived/completed/

## Stated status

Archived completed (~39 spines + `migrated-tasks/` 81 files). Not a work queue.

## Leftovers

- Several **headers still say active / ready / optional leftover** after
  archive. That is label drift, not a queue.
- `agents/design.md` and `agents/project.md` still link some spines as if
  they lived under `agents/plans/*.md` (paths now under
  `archived/completed/`). Hygiene for L0, not reopen.
- `migrated-tasks/` name-collides with **live** plans (B01–B03). Archive
  copies are not the live spines.

## Why this verdict

Option 2: do not un-archive duck-tape or extract-until-TOM plans. Shipped
locks (D023, D039–D044, H1, D036, D069, FCC, slot machines, apply epochs)
are import **strategy**, already named on `forge-firm-abstractions`. No
archived spine appears on PRIORITY parked or still-open.

**Should-reopen: none.**

## Destination

Stay in `agents/plans/archived/completed/`. Do not un-archive. Do not copy
this directory onto PRIORITY.

## Absorb

Do not lose (already on the refactor plan unless noted): D023 child-list,
D039–D044 apply, D069 tab geometry, H1 dual monitor-resolve, D036 gi-free
`lib/shared/`, FCC / first-class containers as OpSet vocabulary, ApplyEpoch /
slot-machine **strategy**. Do **not** absorb “keep extracting `window.js` /
`tree.js` until TOM appears” (`forge-codebase-audit` B2) — that is option 1.

## Spine names (top-level `archived/completed/*.md` only)

Not nested `*/completed/` slice dirs.

1. `forge-action-pipeline.md`
1. `forge-cli-jobs.md`
1. `forge-cli-user-surface.md`
1. `forge-codebase-audit-b-review.md`
1. `forge-codebase-audit.md`
1. `forge-command.md`
1. `forge-css-overrides.md`
1. `forge-daily-driver.md`
1. `forge-dnd-drop-zones.md`
1. `forge-dnd-minsize-gate-titlebar.md`
1. `forge-first-class-containers.md`
1. `forge-focus-close-and-escape.md`
1. `forge-fork-eval.md`
1. `forge-harden-and-session.md`
1. `forge-layout-apply-contract.md`
1. `forge-layout-clean-empty.md`
1. `forge-layout-cold-topology.md`
1. `forge-layout-control-loop.md`
1. `forge-layout-in-process.md`
1. `forge-layout-live-x11.md`
1. `forge-layout-reliability.md`
1. `forge-layout-settle-contract.md`
1. `forge-layout-settle-pure.md`
1. `forge-layout-sizes.md`
1. `forge-layout-slot-machines.md`
1. `forge-layout-sugar.md`
1. `forge-layout-thrash-analysis.md`
1. `forge-layout-workspace-scope.md`
1. `forge-monitor-recovery-rename.md`
1. `forge-nested-cli-separation.md`
1. `forge-nested-isolation.md`
1. `forge-settle-learning.md`
1. `forge-stacked-layouts.md`
1. `forge-tab-chrome-drag.md`
1. `forge-tab-click-drag.md`
1. `forge-tab-drag-residuals-pr12-pr14.md`
1. `forge-wayland-operator-residuals.md`
1. `forge-workon-reconcile.md`
1. `forge-workon-thrash-zero.md`

Count: **39** spines.

## Headers sampled (superseded / analysis / PRIORITY-named)

| Spine | Header (~status) | Note |
| --- | --- | --- |
| forge-layout-settle-pure | **superseded** by control-loop | Keep historical; do not implement PS1–PS3 |
| forge-layout-thrash-analysis | analysis-only; next was daily-driver | No implement queue |
| forge-tab-drag-residuals-pr12-pr14 | “ready for acceptance” | **False header.** PR12–PR15 shipped under `forge-tab-click-drag` |
| forge-codebase-audit | wave 1 + B1 done; residual size optional | B2 extract = option 1; do not reopen |
| forge-codebase-audit-b-review | independent audit (2026-07-25) | Companion to audit; close |
| forge-layout-control-loop | still says **active** | Merged; further action work was action-pipeline |
| forge-settle-learning | “active — implement via settle-contract” | Absorbed; superseded |
| forge-layout-cold-topology | still says **active** | Residual optional/human; not PRIORITY |
| forge-dnd-minsize-gate-titlebar | no Status line | Product shipped; live open-min plans are separate |

## Exceptions (not default close-as-boring)

Default for all 39 spines: **close** (already archived).

| Spine | Exception | Action |
| --- | --- | --- |
| *(none)* | **should-reopen** | — |
| forge-codebase-audit (+ b-review) | absorb-into-refactor | God-object sizes already cited on firm-abstractions. **Do not** import extract-until-TOM. Stale `design.md` / `project.md` live-path links. |
| forge-layout-slot-machines, apply-contract, settle-contract, in-process, action-pipeline | absorb-into-refactor | Epoch / ApplyLayout / D039–D044 **strategy** — already on the refactor plan. Spines stay archived. |
| forge-first-class-containers | absorb-into-refactor | FCC / CON vocabulary → TOM/OpSet import map. Spine stays archived. |
| forge-harden-and-session | absorb-into-refactor | H1 dual monitor-resolve stays FIRM unless import map says otherwise. |
| forge-layout-settle-pure | already-superseded-note | Control-loop replaced implement path. |
| forge-settle-learning | already-superseded-note | Absorbed by settle-contract. |
| forge-layout-thrash-analysis | already-superseded-note | Analysis; daily-driver executed. `design.md` still points at old live path. |
| forge-tab-drag-residuals-pr12-pr14 | already-superseded-note | Shipped as tab-click-drag PR12–PR15. Do not revive from “ready for acceptance.” |
| forge-layout-control-loop | already-superseded-note | Stale “active”; merged + action-pipeline. |
| forge-dnd-drop-zones | already-superseded-note | “D024 residual in IC1” belongs to live `forge-canonical-contracts` (B01), not this spine. |
| forge-nested-isolation | already-superseded-note | N5 optional later — not a reopen. |
| forge-layout-sugar / stacked-layouts / css-overrides | already-superseded-note | Optional LS3/LS6, SL6, C3 — leftovers, not PRIORITY. |
| forge-focus-close-and-escape | already-superseded-note | FC2 unfocus abandoned (matches IDEAS Do not revive). |

## `migrated-tasks/` (81 files)

Confirmed **archive of old task files**, not a work queue:

- `agents/tasks/` **does not exist**.
- Files are status snapshots (`done` / `superseded` / `draft parked`).
- Relative `Plan:` links often point at `../plans/…` as if still live.
- Name collisions with **live** spines (scan those live files in B01–B03; do
  **not** close the live plan because a migrated copy says done):
  - `forge-open-min-dnd-cold-wayland.md` (migrated: done; live: ready)
  - `forge-open-min-tab-walk-float.md`
  - `forge-ai-live-test-matrix_at0-capability.md`
  - `forge-container-motion-design_md1-html-prototype.md`
  - `forge-lifecycle-abstractions_d0-rate.md`
  - `forge-resize-and-autotile_d0-discussion.md` (parked → live blocker)
  - `forge-tab-peer-slot-size.md` → live `forge-tab-peer-geometry`
- Duplicates of completed spines (`forge-dnd-minsize-gate-titlebar`,
  `forge-settle-learning`, `forge-layout-settle-pure_d0-discussion`) stay
  archive.

Do not read all 81. Do not un-archive. Do not treat this folder as PRIORITY.

## PRIORITY shadow list

**None of these remain a PRIORITY shadow list.**

PRIORITY parked + still-open (2026-08-27) name only **live**
`agents/plans/*.md` and `agents/blockers/*`. They do **not** name any
`archived/completed/*.md` spine. Archive is cited only as the archive
location. False-complete check: “still queued” items are live files for
B01–B03, not this directory.
