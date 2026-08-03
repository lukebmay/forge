# forge-container-selection — S2 ops matrix (elevated unit)

**Status:** done  
**Plan:** [forge-container-selection.md](../plans/forge-container-selection.md)  
**Branch:** `plan/forge-first-class-containers`  
**Depends on:** S1 done (ops target + bag chrome)

## Goal

When the ops target is an elevated CON, directional **move/swap**, **layout**
set/cycle, and **ungroup** act on that CON as the unit — not the focused leaf
alone. Default (target = focus leaf) stays current leaf behavior.

## Acceptance

1. **Move / swap** directional use `resolveOpsTarget` (or equivalent): elevated
   CON moves/swaps as one unit; leaf path unchanged when not elevated. ✅
2. **Layout cycle / setLayout** target selected CON when elevated; else current
   layoutUnit / parent rules as today. ✅
3. **Ungroup** prefers selected CON when elevated and that node is a dissolve-able
   CON; else nearest parent of focus (existing). ✅
4. **move-in / move-out** already use `resolveMoveUnit` — verify + regression
   tests; fix gaps only. ✅ (aligned via `resolveOpsTarget`)
5. **Resize** (expand/edge): prefer elevated CON when selected; else existing
   layoutUnit (S0 matrix). No mouse-resize rewrite. ✅
6. Unit tests for elevated vs leaf paths (pure helpers and/or command mocks). ✅
7. No kit binding work (S3). No nested-tab product push (S4). ✅

## Out of scope

- S3 chords / cheatsheet  
- Selection mode v2  
- Zoom / mouse residual  

## Handoff pointers

- Pure: `lib/extension/layout-unit.js` (`resolveOpsTarget`, `isElevatedSelection`)
- Move unit already: `resolveMoveUnit` — align move/swap commands to ops target
- Plan matrix: S0 “Ops target matrix (v1)” in plan doc
- Session: [agents/HANDOFF.md](../HANDOFF.md)

## Session note (overwrite)

**S2 shipped 2026-08-03** on `plan/forge-first-class-containers`.

| Piece | Where |
| --- | --- |
| Pure | `resolveLayoutOpsTarget`, `resolveUngroupOpsTarget`, `resolveResizeOpsSeed`; `resolveMoveUnit` = `resolveOpsTarget` |
| Commands | Move/Swap/SwapNext/Prev, Layout*, Ungroup honor elevated unit |
| Tree | `swapUnits` CON↔CON / CON↔WINDOW; adjacent CON unit swap; WINDOW→CON still enters |
| Resize | `window.js` expand/edge seed via `resolveResizeOpsSeed` |
| Session API | layout / layout-cycle / ungroup honor attach when elevated |
| Tests | layout-unit S2 + CommandHandler elevated + Tree CON swap/move; **2053** green |

**Next:** S3 kit bindings (Vim Super+p, BackSpace clear multi-bind, cheatsheet).
