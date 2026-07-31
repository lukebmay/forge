# forge-first-class-containers_r1b-edge-owning-split

**Status:** done (A/B AGREE)  
**Plan:** [forge-first-class-containers.md](../forge-first-class-containers.md)  
**Branch:** `plan/forge-first-class-containers`  
**Wave:** **R1 residual** (edge keyboard → owning-split)  
**Depends:** R1 (`layout-resize.js` + expand/shrink wired)

## Goal

Finish **I3 for keyboard edge resize**: `WindowResizeLeft|Right|Top|Bottom`
must adjust percents via `resolveOwningSplit` + `_applyOwningSplitDelta`, not
only Meta `move_resize_frame` + grab debounce.

R1 shipped expand/shrink dual owning-split and left residual:

> Keyboard edge `resize()` + mouse `_handleResizing` still Meta/grab — later wire.

This task owns the **keyboard edge** path. Mouse drag is optional if a small
shared hook is obvious; otherwise document residual for a later slice.

### Locked rule (plan)

```text
resize(edge):
  unit = focused layout unit (window, or tab/stack bag if inside)
  axis = axis of edge
  target = lowest ancestor of unit that is H/V split on `axis` and has a tiled pair
  if no target: no-op
  else: adjust target percent vs pair; userSized; normalize
```

## Acceptance

1. **Keyboard edge path** (`wm.resize` / `WindowResize*` / CLI edge amount):
   - Resolve axis from edge (L/R → HORIZONTAL, T/B → VERTICAL).
   - Use `resolveOwningSplit(focus, axis, accessors)` then apply signed pixel
     delta via `_applyOwningSplitDelta` (or equivalent shared helper).
   - Layout unit = bag when focus is inside TABBED/STACKED (resolver already
     does this via `layoutUnit`).
   - No-op when no owning split on that axis (do not thrash Meta rect alone).
   - Positive `amount` on an edge **grows** the focused unit’s share on that
     axis when the pair can absorb debit; negative shrinks. Match expand’s
     percent math; edge only picks **one** axis (not dual).

2. **Sign / pair**: Prefer the same pair selection as `pickSplitPair` /
   expand. If current grab-based edge semantics need a signed delta flip so
   “right-increase” grows the focused share when the pair is on the right,
   encode that clearly in pure or WM helper tests — no silent wrong-direction.

3. **Bypass or minimize grab machinery** for the pure percent path when the
   window is tiled: avoid inventing a Meta grab solely to drive
   `_handleResizing` if owning-split already updated percents + `renderTree`.
   Keep grab path available where still required (floats, non-tile) or leave
   those as no-op/legacy with a short comment.

4. **Tests**
   - Unit: nested H-in-V — off-axis edge walks to correct ancestor (extend
     `tests/unit/extension/layout-resize.test.js` and/or WM command tests).
   - Unit: tab/stack bag is the unit (edge resizes bag vs split pair).
   - `npm test` green.

5. **Mouse** (`_handleResizing`): either wire ancestor walk to match
   `resolveOwningSplit` when cheap, **or** leave residual noted in plan
   session note + this task (do not half-break grab resize).

6. **Docs:** brief plan REG / session note; no yuiop / R2 prefs rename.

## Non-goals

- Prefs/cheatsheet Size vs Resize (R2)
- yuiop ratio keys / auto-tile
- Zoom (Z0+)
- Full rewrite of mouse drag event loop unless one-line/shared math only

## Session note

**R1b done** — A implement + B **AGREE**. Branch `plan/forge-first-class-containers`.

### Shipped
- `lib/extension/window.js` — tiled `resize()` → one-axis `resolveOwningSplit` +
  `_applyOwningSplitDelta` + `renderTree`; float keeps Meta grab debounce
- Tests: `WindowManager-resize.test.js` R1b (nested H-in-V, L/R same sign, bag,
  no-op); #532 / h6z9 / 9fwj grab suites float-scoped
- `npm test` — **188 files / 2023** passed (A + B independent)

### Residual
Mouse `_handleResizing` still Meta/grab — later slice if needed.

### Next
Optional **R2** Size naming or **Z0** discussion; no auto-start zoom.
