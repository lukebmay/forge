# forge-first-class-containers_c3-split-chrome

**Status:** ready for B  
**Plan:** [forge-first-class-containers.md](../plans/forge-first-class-containers.md)  
**Branch:** `plan/forge-first-class-containers`  
**Wave:** **C3**  
**Depends:** C0–C2 + R1 (structure ops + units stable)

## Goal

Make H/V container structure **readable** without the layout debug overlay
(invariant **I5**). Use the existing **split-border** visual language (edge
indicator on tiles) — extend it, don’t invent a second chrome system.

Locked plan modes:

| Mode | Behavior |
| --- | --- |
| **Default: focus ancestry** | Chrome for H/V CONs on the focused unit’s parent chain |
| **Show all** | Setting / toggle: H/V indicators on every split CON |
| **While dragging** | Force show-all for drag duration; restore prior mode after |

## Acceptance

### 1. Pure target resolver (required)

Extract testable helpers (prefer `layout-unit.js` or new pure
`lib/extension/layout-chrome.js` — no GObject/Mutter):

1. **`collectSplitChromeTargets(focusNode, opts)`** (names flexible) returns
   ordered targets: `{ con, axis: 'H'|'V' }` for HSPLIT/VSPLIT CONs only
   (skip TABBED/STACKED/MONITOR-as-bag unless MONITOR itself is H/V with tiled
   pairs — prefer real CON splits; MONITOR H/V with ≥2 tiled children may count).
2. **Modes:**
   - `ancestry` (default): walk parents from layout unit (window or tab/stack
     bag — same unit idea as resize) up to MONITOR; include each H/V split CON
     on that path that has a tiled pair (or ≥2 tiled children).
   - `all`: every H/V split CON under the focused unit’s MONITOR (or workspace)
     with a tiled pair.
3. Unit tests: nested H-in-V ancestry includes both; tab/stack focus uses bag as
   start; `all` includes sibling branches not on focus path.

### 2. Wire decoration (required)

1. **`DecorationsManager.showWindowBorders`** (and hide paths) use the resolver:
   - **Default ancestry:** focused nest’s H/V ancestors get split chrome.
   - Today only paints **immediate** parent axis on the focused window — extend
     so nested ancestry is visible. Pragmatic OK approaches:
     - multiple split-border actors on focus (one per ancestor level), **or**
     - paint split hint on a representative tiled leaf under each ancestor CON
       (using CON rect / child frame). Prefer least-fragile with existing
       `window-split-border` CSS.
2. Honor existing `split-border-toggle` + `focus-border-toggle` / tiling guards
   (don’t draw when borders disabled / float / maximized as today).
3. No crash on actor teardown (`hideActorBorder` / destroy still clean).

### 3. Show-all setting + toggle (required)

1. GSettings boolean (or enum) e.g. `split-chrome-show-all` default **false**.
2. Keybind/command toggle optional but preferred (schema key unbound or free
   chord; document).
3. When true, resolver mode = `all`.

### 4. Drag force show-all (required)

1. During grab-tile / move drag (DragDropManager grab begin → end), force
   mode `all` for border updates / preview period.
2. On grab end / cancel, restore user show-all setting (no sticky force).
3. Minimal hook: flag on wm (`_splitChromeForceShowAll`) checked by decoration.

### 5. Docs / plan / quality

1. Brief user note (layouts.md or theming/keybindings) — ancestry default,
   show-all toggle, drag show-all.
2. Plan session note + C3 row **Done**; I5 progress.
3. **`npm test` green.** Purposeful pure tests + keep border tests green (update
   mocks if needed).
4. Residue-free.

## Non-goals

- C4 focus parent/child / move-in-out
- Redesign tab/stack titlebars
- Layout debug overlay rewrite
- New color theme system (reuse `.window-split-*`)
- R2 prefs Size rename

## Live verify (orchestrator)

Nested H/V on black: focus deep leaf → both axes readable under ancestry;
toggle show-all → sibling splits visible; drag briefly forces show-all.
**Do not kill Ghostty.** HUP OK after install.

## Session note

**C3 implement (Task Force A)** on `plan/forge-first-class-containers`.

### Shipped
1. **Pure** `lib/extension/layout-chrome.js`: `collectSplitChromeTargets`,
   `splitChromeAxis`, `isChromeSplit`, `findAncestorMonitor` — modes
   `ancestry` | `all`; unit = `layoutUnit` (tab/stack bag); MONITOR H/V with
   ≥2 tiled counts.
2. **Decoration:** multi-actor `windowActor.splitBorders[]` (+ legacy
   `splitBorder`); ancestry paints multiple axes on focus; show-all may paint
   sibling leaves via `_pickSplitChromeLeaf`.
3. **Setting** `split-chrome-show-all` (default false) + prefs Appearance switch;
   keybind `split-chrome-show-all-toggle` (unbound) → `SplitChromeShowAllToggle`.
4. **Drag:** `wm._splitChromeForceShowAll` set on grab begin, cleared on grab end.
5. **Docs:** `docs/user/layouts.md` (split chrome modes), `keybindings.md`.
6. **`npm test`:** 1995 passed (188 files).

### APIs / files
- `lib/extension/layout-chrome.js` (new)
- `lib/extension/decoration.js`, `drag-drop.js`, `command.js`, `keybindings.js`, `window.js`
- schema / `settings-keys.js` / kits / `appearance.js` / fixtures
- `tests/unit/extension/layout-chrome.test.js`

### Residual for B / live
- Nested same-axis double right-edge (rare) overlaps on focus
- Show-all paints first tiled leaf under sibling CONs (not CON geometry frame)
- Live black: nested H-in-V ancestry, toggle show-all, brief drag force-all
- No commit (parent after B AGREE)
