# Handoff — forge (lukebmay)

**Updated:** 2026-08-03  
**Branch:** `plan/forge-first-class-containers` (tracks `origin`)  
**Default:** `master` — **not** merged this session (selection mid-wave)  
**Remotes:** `test` / `prod` **not** touched  

## Where we are

| Layer | Status |
| --- | --- |
| Containers spine C0–C5 + R1/R1b + R2 | **Done** (pair-cannibalization locked) |
| Selection **S0** design | **Locked** 2026-08-03 |
| Selection **S1** state + bag chrome | **Done** |
| Selection **S2** elevated move/swap/layout | **Done** |
| Selection **S3** kit chords | **Next** |
| Live QA S5 + checklist A–G | After S3 |

**Tests:** full unit suite green at S2 ship (**2053**).

## Next agent — do this first

1. Stay on **`plan/forge-first-class-containers`**.
2. Merge **`master` → feature** before coding if master moved.
3. Implement **[S3](./tasks/forge-container-selection_s3-kit-bindings.md)** — Vim Super+p, BackSpace clear multi-bind, cheatsheet.
4. Conflict-scan Super+p / BackSpace family against GNOME + kits.

### S2 shipped (summary)

| Op | Elevated CON |
| --- | --- |
| Move / swap directional (+ SwapNext/Prev) | Whole CON via `resolveMoveUnit` + `swapUnits` |
| Layout cycle / setLayout | Selected CON via `resolveLayoutOpsTarget` |
| Ungroup | Selected CON via `resolveUngroupOpsTarget` |
| Resize expand/edge | Seed via `resolveResizeOpsSeed` → owning-split |

WINDOW → adjacent CON still **enters** the container (leaf path). CON → adjacent CON **swaps** bags.

## Key code map

| Concern | Path |
| --- | --- |
| Pure ops target | `layout-unit.js` — S1 + S2 helpers |
| Commands | `command.js` — Move/Swap/Layout*/Ungroup |
| Tree units | `tree.js` — `swapUnits`, `_unitSwappable`, CON move |
| Resize | `window.js` — expand/resize seed |
| Session API | `session-api.js` — layout / ungroup attach |
| Bag chrome | `decoration.js` — `.window-selection-border` |
| Clear key (unbound) | schema `window-selection-clear` — **S3 binds** |

## Design locks (do not re-litigate)

Full table: [forge-container-selection.md](./plans/forge-container-selection.md) S0.

- Sticky unit selection; **not** mode-first  
- Focus border **always** on Meta window; selection = **separate** bag class  
- Meta focus to **other** window resets selection  
- Vim parent candidate `Super+p`; clear = BackSpace family multi-bind  
- Nested TABBED: allow, **discourage** promote  

## Soft leftovers (not blockers)

| Item | Notes |
| --- | --- |
| Mouse resize residual | containers plan R residual |
| Z0 zoom | after selection honest |
| Wake mon thrash | orthogonal soft-rehome |
| Containers → master merge | when operator smoke OK |
| D0 layout settle pure | separate P1; needs user lock |

## Human blockers

None hard for selection path.

## Plans

| Plan | Next |
| --- | --- |
| [forge-container-selection.md](./plans/forge-container-selection.md) | S3 |
| [forge-first-class-containers.md](./plans/forge-first-class-containers.md) | residual mouse / Z0 after selection |
| [PRIORITY.md](./PRIORITY.md) | queue |

Completed S2:  
`agents/plans/forge-container-selection/completed/forge-container-selection_s2-ops-matrix.md`
