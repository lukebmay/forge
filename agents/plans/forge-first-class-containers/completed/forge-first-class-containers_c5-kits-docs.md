# forge-first-class-containers_c5-kits-docs — C5 kits/docs/DESIGN polish

**Status:** done  
**Plan:** [forge-first-class-containers](../../forge-first-class-containers.md)  
**Branch:** master (default)  
**Blocker:** (none)  
**Updated:** 2026-08-18  
**Agent:** Grok 4.5 implementer + orchestrator review

## Goal

Close Wave C with **kits + docs + DESIGN** matching shipped C0–C4 / R1.
Update the deferred REG table. Document R2 Resize vs Size. Do **not** open
Wave Z, yuiop, MD1, or P3 `_layoutOp` flatten strip.

## Acceptance

- [x] **User keybindings** (`docs/user/keybindings.md`):
  - Kits match `lib/shared/keybind-presets.js` for group/ungroup, focus
    parent/child, move in/out, expand/shrink, edge resize.
  - Remove abandoned **Unfocus** (`Ctrl+Super+Esc`) from i3 (and any other)
    kit tables — product abandoned; presets already comment that.
  - Document **split chrome show-all** (prefs Appearance; kit toggle unbound
    by default; grab forces show-all).
  - **R2:** short note that **Resize** (edge `window-resize-*`) ≠ **Window Size**
    (expand/shrink/golden) — same split as cheatsheet categories.
- [x] **User layouts** (`docs/user/layouts.md` and/or `layout.md`):
  - RunSteps list includes `focus-parent` / `focus-child` / `move-in` /
    `move-out` (and existing `merge-group`/`group`/`ungroup`).
  - No stale monocle advertising.
- [x] **DESIGN.md** Layout reshape phases: Wave C (+ R1) **shipped** (C0–C5);
  Phase 2–3 no longer “active implement.” Mention focus parent/child, move
  in/out, split chrome I5, owning-split R1. Zoom/float remain later.
- [x] **FCC plan** (`agents/plans/forge-first-class-containers.md`):
  - Session note: C5 done.
  - C5 row Done; REG table current (REG-focus-parent done; REG-ensure-flatten
    stays profile/ensure → PRIORITY P3; REG-i3-super-f still optional Z;
    REG-expand-dual-axis R2 docs done via this slice).
- [x] **Kits/presets:** unchanged — already matched C4 chords. No `Super+m` /
  `Super+f` → zoom.
- [x] **Residual lossy:** `_layoutOp` flatten left for P3 (profile/ensure only;
  user toggles already `setLayout`). Documented in REG table.
- [x] L0: keybind-presets **37** + Keybindings **55** = **92** PASS. Nest not
  required (docs only); `running: False`.
- [x] Session note + PRIORITY/HANDOFF updated; task in `completed/`.
- [x] **No commit/push** (human did not ask).

## Context for the next agent (complete + succinct)

### Locked

- D039–D044; Wave C (+R1/R2-docs) closed through C5; REG-auto-exit-tabbed keep.
- User `forge` product-only; nest/live = `./scripts/forge/forge-test`.

### Proven (2026-08-18)

| Layer | Result |
| --- | --- |
| Host L2 true-cold | `L2.true-cold-dev` + `L2.layout-clean` **PASS** |
| L0 pytest | nested_wayland + layout_apply + live_matrix **170** |
| L0 vitest (pre-C5) | C4 suite **156** |
| L0 vitest (C5) | presets + Keybindings **92** |
| Nest mon=1 clean | **PASS**; stopped |
| Nest mon=2 ghosttys | **PASS**; stopped |

### Deferred

| Item | Where |
| --- | --- |
| REG-ensure-flatten / `_layoutOp` strip | PRIORITY **P3** |
| REG-i3-super-f / Wave Z | park until promoted |
| Tab PR7 docs | park |

### Do not

- Wave Z / rebind Super+m or Super+f to zoom without promote
- Strip `_layoutOp` outside a P3 task
- Teach `forge test` / top-level `forge nested`
- Close durable-agent Ghostty windows

## Session note

**2026-08-18 C5 shipped (docs only; uncommitted).**

| Surface | Change |
| --- | --- |
| `docs/user/keybindings.md` | Drop Unfocus; show-all; R2 Resize≠Size; i3 expand/edge rows |
| `docs/user/layouts.md` | RunSteps C4 verbs; focus/move parent; Resize≠Size |
| `docs/DESIGN.md` | Wave C (+R1) **shipped** through C5 |
| FCC plan | C5/R2 Done; REG current |
| PRIORITY/HANDOFF | C5 done; next PR7 park · P3 `_layoutOp` |
| Presets | unchanged |

Orchestrator review: acceptance boxes closed; HANDOFF Start-here stale C5
pointer corrected in same wrap-up.
