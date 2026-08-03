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
| Selection **S1** state + bag chrome | **Done** — tip `f61e69d` |
| Selection **S2** elevated move/swap/layout | **Next** |
| Selection **S3** kit chords | After S2 |
| Live QA S5 + checklist A–G | After S2–S3 |

**Tip commits (selection path):**

- `f61e69d` — `feat(selection): S1 ops target state and bag chrome`
- `261ec83` — S0 design lock + S1 task handoff

**Tests:** full unit suite green at S1 ship (**2040**).

## Next agent — do this first

1. Stay on **`plan/forge-first-class-containers`** (or split `plan/forge-container-selection` only after containers→master).
2. Merge **`master` → feature** before coding if master moved.
3. Implement **[S2](./tasks/forge-container-selection_s2-ops-matrix.md)** — move/swap/layout/ungroup honor elevated CON.
4. Do **not** start S3 kit binds until S2 acceptance is green (or same PR only if tightly scoped).

### S2 acceptance (summary)

See task file. Matrix from S0:

| Op | Elevated CON target |
| --- | --- |
| Move / swap directional | **Whole CON** as unit |
| Layout cycle / setLayout | Selected CON |
| Ungroup | Selected CON if CON |
| Resize expand/edge | Prefer selected CON if elevated; else layoutUnit |

Use existing `resolveOpsTarget` / `resolveMoveUnit` / `isElevatedSelection` — do not invent a second selection store.

## Key code map (S1)

| Concern | Path |
| --- | --- |
| Pure ops target | `lib/extension/layout-unit.js` — `resolveOpsTarget`, `isElevatedSelection`, `clearOpsTarget`, `resolveAttachOnFocusChange` |
| Commands | `lib/extension/command.js` — FocusParent/Child (attach **after** activate), ClearSelection |
| Focus reset | `lib/extension/window.js` — Meta focus → `resolveAttachOnFocusChange` + `_lastFocusNodeWindow` |
| Bag chrome | `lib/extension/decoration.js` — `_paintSelectionBorder`, `.window-selection-border` |
| Theme | `stylesheet.css` + cssTag **39** in `lib/shared/theme.js` |
| Clear key (unbound) | schema `window-selection-clear`; kits leave `[]` |
| RunStep | `clear-selection` in `run-steps.js` + `session-api.js` |
| Tests | `tests/unit/extension/layout-unit.test.js` (S1 block), CommandHandler ClearSelection |

## Design locks (do not re-litigate)

Full table: [forge-container-selection.md](./plans/forge-container-selection.md) S0.

- Sticky unit selection; **not** mode-first  
- Focus border **always** on Meta window; selection = **separate** bag class  
- Meta focus to **other** window resets selection; same-window re-focus keeps elevated CON  
- Vim parent candidate `Super+p`; clear = BackSpace family multi-bind (S3)  
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

None hard for selection path. Soft/parked items: see `agents/blockers/` if any open.

## Install smoke (optional before S2)

```sh
# on plan branch
./install   # or make dev
gsettings set org.gnome.shell.extensions.forge logging-enabled true
gsettings set org.gnome.shell.extensions.forge log-level 4
# i3 kit: Super+a = focus-parent → lime bag; focus another window → bag off
```

## Plans

| Plan | Next |
| --- | --- |
| [forge-container-selection.md](./plans/forge-container-selection.md) | S2 |
| [forge-first-class-containers.md](./plans/forge-first-class-containers.md) | residual mouse / Z0 after selection |
| [PRIORITY.md](./PRIORITY.md) | queue |

Completed S1 task:  
`agents/plans/forge-container-selection/completed/forge-container-selection_s1-state-chrome.md`
