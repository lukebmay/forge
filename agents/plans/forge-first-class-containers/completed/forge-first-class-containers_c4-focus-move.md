# forge-first-class-containers_c4-focus-move

**Status:** done (A/B AGREE + live)  
**Plan:** [forge-first-class-containers.md](../plans/forge-first-class-containers.md)  
**Branch:** `plan/forge-first-class-containers`  
**Wave:** **C4**  
**Depends:** C0–C3 + R1

## Goal

Tree navigation without debug overlay: **focus parent / focus child** (i3
`$mod+a` class) plus **move-in / move-out** for the layout unit. Marks
**REG-focus-parent** as added.

## Acceptance

### 1. Focus parent / child (required)

1. Pure helpers (e.g. `layout-unit.js` or `layout-focus.js`):
   - **`resolveFocusParent(focusNode)`** → nearest parent CON (not MONITOR
     unless no CON — prefer stop at MONITOR without “selecting” it as focus
     target; no-op at mon root).
   - **`resolveFocusChild(con, lastChildHint?)`** → preferred child WINDOW or
     nested CON for “focus child” (last focused window under con, or first
     tiled child).
2. **Commands:** `FocusParent` / `FocusChild` wired to schema keys
   `window-focus-parent` / `window-focus-child` (names flexible).
3. **Behavior:**
   - Focus parent: activate a window under the parent CON that represents the
     unit (prefer current focus if still under parent; else lastTabFocus /
     last focused descendant). Also set `tree.attachNode` to that parent CON so
     open/split attach to the container.
   - Focus child: from current attach/focus CON, move focus to preferred child
     window; clear or set attachNode to child unit.
4. **Presets:** unbound default OK; Safe/Vim may use free chords (document). i3
   kit: prefer `<Super>a` for focus parent if free (REG-focus-parent note).
5. **RunSteps:** `focus-parent` / `focus-child` ops (optional if commands+CLI
   enough; prefer both).

### 2. Move-in / move-out (required)

1. **move-out:** reparent focused layout unit (window or tab/stack bag) one
   level up — insert after former parent among grandparent’s children (i3-like
   “move out of container”). Distinct from **ungroup** (ungroup dissolves CON;
   move-out lifts only the unit).
2. **move-in:** reparent unit into an adjacent sibling CON (prefer last-focused
   direction or next sibling CON; document policy). If no CON sibling, no-op
   (do not invent CON unless merging via existing group).
3. Commands + RunSteps `move-out` / `move-in` (+ schema keys if keybound).
4. Reset sibling percents via existing tree epilogue (`_finishMove` or
   `resetSiblingPercent` pattern).

### 3. Tests / docs

1. Pure resolve tests + tree reparent id tests for move-in/out.
2. Docs brief (layouts or keybindings).
3. Plan REG-focus-parent → **C4 added**; session notes; `npm test` green.

## Non-goals

- C5 kits polish sweep
- Zoom / float groups
- Full i3 IPC parity
- Changing directional WindowMove semantics wholesale

## Live verify

Focus parent walks up tab→split; focus child down; move-out lifts window from
group without dissolving remaining siblings. Ghostty kept.

## Session note

**C4 done** — A implement + B **AGREE** + live black. Branch
`plan/forge-first-class-containers`.

### Shipped
- Pure: resolveFocusParent/Child, resolveMoveUnit/Out/InSibling
- Tree: moveUnitOut / moveUnitIn (≠ ungroup)
- Commands: FocusParent/Child, WindowMoveOut/In
- Keys: window-focus-parent/child, window-move-out/in; i3 Super+a parent
- RunSteps: focus-parent, focus-child, move-out, move-in
- REG-focus-parent **C4 — ADDED**
- Live: focus-parent + move-out lifted Maps; CON kept Grok; Ghostty OK
- Tests: 2016 / 188 files

### Next
**C5** kits/docs/REG polish

