# forge-first-class-containers_r1-owning-split-resize — Owning-split resize (I3)

**Status:** done  
**Plan:** [forge-first-class-containers](../../forge-first-class-containers.md) Wave R  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-17  
**Agent:** Grok 4.6 implementer (orchestrator-assigned)

## Goal

One **owning-split resolver** for keyboard edge resize, mouse grab resize, and
grow/shrink. Invariant **I3**: resize mutates percent of the owning split
unit, not vacuum pixels. Nested off-axis edge resizes the correct ancestor.

## Acceptance

- [x] Named API (Tree or WM): resolve owning split for `(unit, axis|edge)` →
      target CON + pair; adjust percents; set `userSized`; normalize siblings.
      Catalog row in `docs/dev/contracts.md`.
- [x] Locked rule (from FCC plan):

  ```text
  unit = focused layout unit (window, or tab/stack bag if inside)
  axis = axis of edge
  target = lowest ancestor of unit that is H/V split on `axis` and has a tiled pair
  if no target: no-op
  else: adjust target percent vs pair; userSized; normalize
  ```

- [x] Wire **keyboard** `WindowResize*` / `wm.resize` path through the resolver.
- [x] Wire **mouse** `_handleResizing` through the same resolver (no twin math).
- [x] Wire **expand/shrink** through the resolver. Dual-axis `[`/`]` may apply
      the rule twice (once per axis) — document as REG-expand-dual-axis re-spec,
      not silent child+grandparent hacks if the resolver already covers it.
- [x] Tab/stack focus: unit is the **bag CON**, not a leaf inside the bag.
- [x] **I3 unit tests:** nested off-axis edge hits ancestor split; same-axis
      hits parent; no-op when no pair; child identity unchanged; percents sum
      sane after normalize.
- [x] L0 green for touched suites. Nest only if JS needs live prove via
      `./scripts/forge/forge-test nested run -- …`. Never personal `dev`/`t1`.
- [x] Overwrite session note + FCC plan Wave R note + PRIORITY/HANDOFF when
      done. Move this file to
      `agents/plans/forge-first-class-containers/completed/` on ship.

## Context for the next agent (complete + succinct)

### Locked

- D039–D044; C1 setLayout I1; C2 group/ungroup I2 (`tree.group` / `tree.ungroup`).
- Owning-split rule above (FCC plan § Resize).
- D045: nest = `./scripts/forge/forge-test nested` only.
- Do not close durable-agent ghostty windows.
- Do not open C3/C4, yuiop/R3, or ratio autotile in this slice.
- Do not commit/push unless operator asks.

### Entry points

| Concern | Path |
| --- | --- |
| Resolve | `lib/extension/tree.js` `layoutUnit` / `resolveOwningSplit` |
| Apply (px) | `lib/extension/window.js` `applyOwningSplit` |
| Keyboard | `command.js` `WindowResize*` → `wm.resize` grab → `_handleResizing` |
| Expand/shrink | `expand` / `shrink` → two `applyOwningSplit` (H then V) |
| Mouse grab | `_handleResizing` → resolver + `_applyOwningSplitFromGrab` |
| Golden ratio | `_goldenRatioAgainstPair` — left on immediate parent |
| Contracts | `docs/dev/contracts.md` TILE resize row |
| C2 completed | `…/completed/forge-first-class-containers_c2-group-ungroup.md` |

### Proven

- I3 resolve: same-axis parent; nested off-axis ancestor; tab bag unit; no-op
  no-pair; percents sum; child identity stable.
- Grab still cumulative (`initRect` + `_pairInitRect`); existing 305/497/ox8
  /hs6l/34c6 still green.
- Expand 2x2 (gm0z) still grows both axes via H then V.
- Nest `running: False`.

### Failed / traps

- Do not reintroduce `_resizeContainerAgainstSibling` or `nextVisible` pair
  walk for percent debit.
- Grab must stay cumulative — do not feed per-event `deltaPx` into
  `applyOwningSplit` from `_handleResizing`.
- Outer-edge with no sibling that way walks up (direction-aware pair); expand
  with no direction uses next/prev sibling.

### Enable / test

```bash
npm test -- tests/unit/tree/owning-split-i3.test.js \
  tests/unit/window/WindowManager-handle-resizing.test.js \
  tests/unit/window/WindowManager-resize.test.js \
  tests/regression/bug-gm0z-window-expand-both-axes.test.js \
  tests/regression/bug-305-resize-boundary.test.js \
  tests/regression/forge-ox8-middle-child-tabbed-resize.test.js \
  tests/regression/bug-497-tabbed-resize.test.js
```

### Risks

- Keyboard still mutates Meta frame then grab-applies (existing `wm.resize`
  contract). Visual-only until grab end if `_handleResizing` no-ops.
- Golden ratio still immediate-parent only (R3 / REG-golden-ratio).
- Host tip lags until operator reload.

## Session note

**2026-08-17 R1 shipped on master (uncommitted; operator did not ask).**

### API

| Surface | Path | Behavior |
| --- | --- | --- |
| `Tree.layoutUnit(node)` | `lib/extension/tree.js` | Window, or tab/stack bag if inside |
| `Tree.resolveOwningSplit(unit, axis\|edge, opts?)` | same | Lowest ancestor in H/V on axis with a tiled pair. Direction (edge or `opts.direction`) picks adjacent sibling; none that way → walk up. No direction → next or prev if last |
| `WM.applyOwningSplit(unit, axis\|edge, deltaPx, opts?)` | `lib/extension/window.js` | Resolve + percent debit + `userSized` + normalize |
| `_applyOwningSplitFromGrab` | same | Cumulative grab apply on resolved target/pair |
| `_expandNodeAgainstPair` | same | Thin: `applyOwningSplit` on unit + parent axis |
| `_resizeContainerAgainstSibling` | deleted | Folded into resolver |

### Wiring

- Keyboard: `WindowResize*` → `wm.resize` (Meta rect + grab) →
  `_handleResizing` → `resolveOwningSplit` + `_applyOwningSplitFromGrab`.
- Mouse: same `_handleResizing` path. Grab semantics kept.
- Expand/shrink: `layoutUnit` then `applyOwningSplit` H then V
  (REG-expand-dual-axis re-spec).

### Tests

New: `tests/unit/tree/owning-split-i3.test.js` (**13**).

```bash
npm test -- tests/unit/tree/owning-split-i3.test.js \
  tests/unit/window/WindowManager-handle-resizing.test.js \
  tests/unit/window/WindowManager-resize.test.js \
  tests/regression/bug-gm0z-window-expand-both-axes.test.js \
  tests/regression/t4-sizing-policy.test.js \
  tests/regression/bug-305-resize-boundary.test.js \
  tests/regression/bug-34c6-resize-cross-container-boundary.test.js \
  tests/regression/bug-hs6l-resize-toward-floating-last-sibling.test.js \
  tests/regression/forge-ox8-middle-child-tabbed-resize.test.js \
  tests/regression/bug-497-tabbed-resize.test.js \
  tests/unit/command/CommandHandler.test.js \
  tests/regression/feat-zlg-golden-ratio.test.js \
  tests/regression/bug-resize-three-windows.test.js \
  tests/regression/bug-532-held-resize.test.js \
  tests/regression/bug-h6z9-manual-resize-debounce-scope.test.js \
  tests/regression/bug-9fwj-resize-focus-drift-cleanup.test.js \
  tests/unit/tree/ungroup-i2.test.js \
  tests/unit/tree/set-layout-i1.test.js
# 180 passed
```

Nest: **not run** (structure + grab unit-proven). `nested status` →
`running: False`.

### Do not

- No C3/C4 / yuiop / R3
- No `_layoutOp` from resize
- Uncommitted (operator did not ask to commit)
