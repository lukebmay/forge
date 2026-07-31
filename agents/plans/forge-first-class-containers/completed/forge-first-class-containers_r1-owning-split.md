# forge-first-class-containers_r1-owning-split

**Status:** done (A/B AGREE)  
**Plan:** [forge-first-class-containers.md](../forge-first-class-containers.md)  
**Branch:** `plan/forge-first-class-containers`  
**Wave:** **R1**  
**Depends:** C0–C1 (stable units / setLayout)

## Goal

Single **owning-split** resolver for resize: edge/grow/shrink adjust percent of
the correct H/V ancestor unit, not vacuum pixels. Keyboard edge resize,
expand/shrink, and (where cheap) the same math path for mouse should share it.

### Locked rule (from plan)

```text
resize(edge):
  unit = focused layout unit (window, or tab/stack bag if inside)
  axis = axis of edge
  target = lowest ancestor of unit that is H/V split on `axis` and has a tiled pair
  if no target: no-op
  else: adjust target percent vs pair; userSized; normalize
```

Grow/shrink may apply the rule twice (both axes) by resolving each axis.

## Acceptance

1. **Pure (or pure-ish) resolver** under `lib/extension/` (e.g.
   `layout-resize.js` or extend `layout-unit.js` carefully):
   - Input: focus unit node, edge/axis (or dual-axis expand), amount in px or
     fraction; tree accessors for parent/layout/tiled siblings/rect.
   - Output: which node+pair to mutate, or no-op.
   - Unit tests for nested H-in-V: off-axis edge walks to ancestor; tab/stack
     unit resizes the bag against its split parent, not a leaf inside the bag.

2. **Wire keyboard path:**
   - `expand` / `shrink` use the resolver (both axes via two applications).
   - Prefer edge `resize()` path to also adjust percents via owning-split when
     the focused window is tiled (today it mutates Meta rect + grab machinery —
     if full rewire is too large, at least document remaining grab path and make
     **expand/shrink + one edge path** share the resolver; do not leave expand
     on parent/grandparent-only heuristic if resolver exists).

3. **Unit = bag if tab/stack:** when focus is inside TABBED/STACKED, the layout
   unit for resize is the bag CON (parent), not the leaf window alone — so
   resize fights the split pair of the bag.

4. **I3 tests:** nested tree percents change only on the owning split; no-op when
   no ancestor on that axis has a pair.

5. **`npm test` green.** No yuiop/ratio-step (out of scope — other plan).

6. Brief plan/REG note if REG-expand-dual-axis behavior changes (document as
   dual owning-split steps).

## Non-goals

- Prefs/cheatsheet rename Size vs Resize (R2)
- yuiop ratio keys / auto-tile
- C2 group/ungroup, C3 chrome
- Full mouse drag rewrite unless a one-line hook already calls expand math

## Session note

**R1 done** — A implement + B **AGREE**. Branch `plan/forge-first-class-containers`.

### Shipped
- `lib/extension/layout-resize.js` — `layoutUnit`, `resolveOwningSplit`, `resolveOwningSplitsBothAxes`
- `tests/unit/extension/layout-resize.test.js` (I3 nested / bag / no-op)
- `expand`/`shrink` dual owning-split via `_applyOwningSplitDelta`
- REG-expand-dual-axis re-specified

### Residual
Keyboard edge `resize()` + mouse `_handleResizing` still Meta/grab — later wire.

### Tests
`npm test` → **187 files / 1972** passed.

### Next
**C2** group/ungroup; optional edge/mouse onto resolver.

---
