# forge-first-class-containers_p3-strip-layoutop-flatten — Strip REG-ensure-flatten

**Status:** done  
**Plan:** [forge-first-class-containers](../../forge-first-class-containers.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-18  
**Agent:** grok-4.5 implementer  
**Model:** 4.5 high (PRIORITY)

## Goal

Stop silent nested-CON peel on absolute `layout` / `_layoutOp` for
TABBED/STACKED (**REG-ensure-flatten**). Mode change must not flatten
children. Flatten helper deleted (no repair-flag peel).

ApplyLayout already uses `_setLayoutStructureOp` (I1 + lift /
`ensure-flatten-refused`). User toggles / layout-cycle already use
`tree.setLayout`. C2 `ungroup` is the explicit dissolve API.

## Acceptance

- [x] `_layoutOp` TABBED/STACKED does **not** call
      `_flattenLayoutParentToWindows` by default
- [x] Nested H/V under target: lift+wrap (parity with
      `_setLayoutStructureOp`) or refuse with `ensure-flatten-refused` — **not**
      silent peel of sibling CONs
- [x] Mon-direct / multi-window H/V wrap-before-tab behavior **kept**
      (subset bag; do not tab whole mon)
- [x] lastTabFocus re-affirm preserve (D016) **kept** when no flatten
- [x] Flatten helper deleted (no callers; no repair opt)
- [x] Prefer delete helper if no caller needs it after strip
- [x] Contracts / DESIGN / FCC REG table: REG-ensure-flatten **dropped**
- [x] Rewrite `tests/regression/bug-tz-tab-apply-flatten.test.js` to the
      **new** contract (old “must flatten” case inverted)
- [x] L0 green for touched suite (layout-cycle, set-layout-i1, tz-tab,
      structure ensure, command/session layout paths)
- [x] Nest not required (unit-only); `running: False`
- [x] Overwrite this session note + HANDOFF/PRIORITY on done

## Context for the next agent (complete + succinct)

### Locked (do not re-litigate)

- D039–D044 slot machines / mon-local groups / overlay / belt deleted
- I1 `tree.setLayout` — mode only, no reparent
- C2 `tree.ungroup` — one CON dissolve (not recursive flatten)
- ApplyLayout structure → `_setLayoutStructureOp`
- User CLI: nest/live = `./scripts/forge/forge-test` only

### Shipped

| Path | Change |
| --- | --- |
| `lib/extension/session-api.js` `_layoutOp` | Lift nested → wrap; refuse if still nested; no peel |
| `session-api.js` | `_flattenLayoutParentToWindows` **deleted** |
| `tests/regression/bug-tz-tab-apply-flatten.test.js` | Assert lift/wrap + siblings preserved |
| FCC REG / DESIGN / contracts | REG-ensure-flatten dropped |

### Verify (L0)

```bash
npm test -- tests/regression/bug-tz-tab-apply-flatten.test.js \
  tests/unit/tree/set-layout-i1.test.js \
  tests/unit/extension/session-api-layout-cycle.test.js \
  tests/unit/extension/layout-apply-structure.test.js \
  tests/unit/command/CommandHandler.test.js
# 5 files / 123 tests PASS; nest running: False
```

## Session note

**2026-08-18:** P3 shipped. `_layoutOp` matches `_setLayoutStructureOp` for
nested TABBED/STACKED (lift focus to mon then wrap, else
`ensure-flatten-refused`). Helper deleted. REG-ensure-flatten dropped.
L0 **123** PASS. Nest not used. Next = PR7 park.
