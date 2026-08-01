# forge-first-class-containers_r2-size-naming

**Status:** done (A/B AGREE)  
**Plan:** [forge-first-class-containers.md](../forge-first-class-containers.md)  
**Branch:** `plan/forge-first-class-containers`  
**Wave:** **R2**  
**Depends:** R1 + R1b (owning-split behavior already shipped)

## Goal

Unify **Resize vs “Window Size”** product surface so prefs schema summaries +
cheatsheet + user docs match one mental model: edge, expand/shrink, golden, and
equalize are all **resize** of tile shares (pair-cannibalization), not two systems.

## Acceptance

1. **Cheatsheet** (`lib/extension/cheatsheet.js`):
   - Drop separate **Window Size** category label for expand/shrink/golden.
   - Group under **Resize** with edges: order within section =
     edge keys → expand → shrink → golden → reset sizes (equalize).
   - Prefer a small pure helper (category map + within-group sort) unit-tested
     if cheap; otherwise cheatsheet-only change with clear comments.

2. **GSchema summaries** (`schemas/org.gnome.shell.extensions.forge.gschema.xml`):
   - Expand / shrink wording reflects dual-axis **tile share** grow/shrink
     (not vague “window”).
   - Reset = equalize **sibling** sizes.
   - Edge summaries may stay; keep short.

3. **User docs** (at least `docs/user/layouts.md` Tile sizes + keybindings if needed):
   - One short note: resize cannibalizes the **pair** only; group to resize
     against many; reset to equalize.
   - No contradiction with “Window Size” language if removed from cheatsheet.

4. **REG** row for expand dual-axis / plan R2: mark R2 naming done if applicable.
5. **`npm test` green.** No keybind chord changes. No yuiop. No mouse rewire.
6. Task + plan session notes overwritten.

## Non-goals

- Mouse `_handleResizing` owning-split wire
- yuiop / auto-tile
- Zoom (Z0)
- Renaming GSettings **key** ids (`window-expand` etc.) — labels only

## Session note

**R2 done** — A implement + B **AGREE**. Branch `plan/forge-first-class-containers`.

### Shipped
- `lib/extension/cheatsheet-group.js` + cheatsheet wire — Resize fold/order
- GSchema + keybindings.schema.json tile-share summaries
- User docs pair-only + group-to-fight-many; DESIGN pair-cannibalization lock
- `npm test` **189 / 2032** (A + B)

### Residual
Mouse owning-split; optional Z0; optional R3 yuiop.
