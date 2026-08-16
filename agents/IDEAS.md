# Ideas / parked decisions (not PRIORITY queue)

**Purpose:** things that are neither “do next” nor firmly dropped. Agents may
promote to PRIORITY or drop after a real need appears. Do **not** treat this
file as a work queue.

**Updated:** 2026-08-16

---

## Layout / apply UX

| Item | Why parked | Promote when |
| --- | --- | --- |
| CLI “nothing applied” wording when spine partially ran | Tiny copy polish; no clear false-ok message path locked after AL8 | A host job reports ok while structure/soft partially failed and wording misleads |
| Soft-only polish if structure green but soft thrashing (R014 class) | Depends on R036 cold structure sign-off first | Cold tree green and soft still max-corrections / sticky open leaf |

---

## Live coverage (optional)

| Item | Why parked | Promote when |
| --- | --- | --- |
| Open-heavy dual-mon `_forge-test-*` nest mon=2 | Not blocking daily driver; mon=1 nest + host mid-session already exercised; dual nest is expensive flake surface | Next dual-mon structure change or pre-release RC |
| L1 scale smoke (`gdisplays load default-no-scale` → restore `default` + `layout dev`) | Human/live; R017 code shipped; thrash class guarded L0 | Operator wants eyes-on reverse scale again |

---

## Lifecycle health (optional residual)

| Item | Why parked | Promote when |
| --- | --- | --- |
| Per-window `windowSignals` / `actorSignals` → WindowAttach | Lifecycle plan scope complete (W1–W5, L8/L11); optional residual only | Disable/leak bug tied to per-window signal arrays, or a window-domain extract |

See [forge-lifecycle-abstractions.md](./plans/forge-lifecycle-abstractions.md) “Optional later”.

---

## Product later (already have plans/blockers)

| Item | Home |
| --- | --- |
| Cross-mon TABBED/STACKED design | [tab planning](./tasks/forge-tab-work-planning.md) · [cross-mon D0](./tasks/forge-tab-groups-cross-mon_d0-discussion.md) |
| Tab chrome / hover-spinner residual | [tab planning](./tasks/forge-tab-work-planning.md) |
| STACKED layouts | [forge-stacked-layouts.md](./plans/forge-stacked-layouts.md) |
| Resize + autotile | [plan](./plans/forge-resize-and-autotile.md) · [blocker](./blockers/resize-autotile-design.md) |

---

## Do not revive

| Item | Note |
| --- | --- |
| `Ctrl+Super+Esc` unfocus (FC2) | Abandoned; keybind unbound |
| Mode B as cold success | Forbidden |
| Personal `dev`/`t1` in live matrix | Use `_forge-test-*` only |
