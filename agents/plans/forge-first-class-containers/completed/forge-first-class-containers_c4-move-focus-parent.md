# forge-first-class-containers_c4-move-focus-parent — Move-in/out + focus parent/child

**Status:** done  
**Plan:** [forge-first-class-containers](../../forge-first-class-containers.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-17  
**Agent:** Grok 4.5 implementer (orchestrator-assigned)

## Goal

Ship **move-in / move-out** (reparent unit into/out of a CON) and **focus
parent / focus child** so nested trees are navigable without a debug overlay.
i3 `$mod+a` class for focus parent. Do **not** open C5 / yuiop / MD1 motion
prototype.

## Acceptance

- [x] Named APIs (Tree and/or WM):
      - **focusParent** / **focusChild** — change keyboard focus target to
        parent CON unit or first/last/appropriate child; use existing
        `afterFocus` / `revealGroupChild` contracts (no twin focus path).
      - **moveIn** / **moveOut** — reparent focused layout unit into a sibling
        or enclosing CON / out to grandparent; child list only via Node
        append/insert/remove/replaceChildren; D044 mon-local for tab/stack.
- [x] Contracts rows in `docs/dev/contracts.md`.
- [x] Command + settings keys + kit bindings (at least one kit; unbound OK on
      others if documented). Prefer Vim/i3-ish chords that do not fight
      existing focus/move keys.
- [x] CLI/RunSteps verbs if thin-client pattern fits (`focus-parent`,
      `focus-child`, `move-in`, `move-out`) — no layout port to `cli/`.
- [x] Unit tests: focus target id after parent/child; reparent identity +
      order after move-in/out; no-op on MONITOR/ROOT where required.
- [x] L0 green. Nest optional via `./scripts/forge/forge-test nested run -- …`
      if live prove needed; leave `running: False`.
- [x] Overwrite session note + FCC plan + PRIORITY/HANDOFF; move to
      `agents/plans/forge-first-class-containers/completed/` on ship.

## Context for the next agent (complete + succinct)

### Locked

- D039–D044; C1 I1; C2 I2; R1 I3; C3 I5.
- REG-focus-parent: **added** in C4 (`tree.focusParent` / commands / kits).
- Elevated `tree.focusUnit` + leaf activate (Meta cannot focus a CON).
- moveIn = existing sibling CON only (no invent-group; use `group`).
- moveOut = simple peel to grandparent (not full Model B).
- D044: move-in to TABBED/STACKED → `normalizeGroupToHomeMonitor`.
- Child list: Node methods only.

### Entry points

| Concern | Path |
| --- | --- |
| APIs | `lib/extension/tree.js` `focusParent` / `focusChild` / `moveIn` / `moveOut` / `focusUnit` |
| Commands | `FocusParent` / `FocusChild` / `WindowMoveIn` / `WindowMoveOut` |
| Keybinds | `window-focus-parent` / `window-focus-child` / `window-move-in` / `window-move-out` |
| RunSteps | `focus-parent` / `focus-child` / `move-in` / `move-out` |
| Contracts | `docs/dev/contracts.md` |
| Tests | `tests/unit/tree/move-focus-parent-c4.test.js` |

### Proven

- C4 L0: move-focus-parent-c4 **12** + CommandHandler / run-steps / keybinds / presets / ungroup / session-api green.
- Nest `running: False` (unit only; nest not required).

### Risks

- Sticky CON chrome / ops-on-elevated-unit (S0) still later — C4 tracks `focusUnit` for nav + move unit only.
- Directional focus clears elevation (`Focus` / `FocusNext`/`Prev`).
- Full Model B peel / multi-tag group remain MD1 / later.

### Enable / test

```bash
npm test -- tests/unit/tree/move-focus-parent-c4.test.js \
  tests/unit/command/CommandHandler.test.js \
  tests/unit/extension/run-steps.test.js \
  tests/unit/keybindings/Keybindings.test.js
./scripts/forge/forge-test nested status   # want running: False
```

## Session note

**2026-08-17 C4 shipped on master (uncommitted; operator did not ask).**

### API

| Surface | Path | Behavior |
| --- | --- | --- |
| `tree.focusParent(node)` | `tree.js` | Elevate `focusUnit` to parent CON; return WINDOW leaf. No-op MONITOR/ROOT/WORKSPACE |
| `tree.focusChild(node)` | same | Descend to child owning leaf / first tiled; set `focusUnit` |
| `tree.moveIn(node)` | same | Reparent **layout unit** into sibling CON; WINDOW→tab via `insertWindowIntoGroup` |
| `tree.moveOut(node)` | same | Reparent layout unit as sibling of parent under grandparent |
| Commands | `command.js` | `FocusParent`/`FocusChild` → reveal/afterFocus; `WindowMoveIn`/`Out` → commitLayout |
| RunSteps | session-api | `focus-parent` / `focus-child` / `move-in` / `move-out` |
| Kits | presets | i3/Vim: `Super+a` / `Shift+Super+a`; move `,` family. Safe: `Ctrl+Super+a` / `,` |

### REG-focus-parent

**Added** (was missing). Not a restore of deleted surface.
