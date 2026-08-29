# Import map (working draft)

**Status:** draft from explore notes 01–06.
**As of:** 2026-08-27
**Legend:** keep · port · reshape · discard · park

Do not implement this session. This is what P1+ consumes.

## Kernel lift

| Piece | Rec | Note |
| --- | --- | --- |
| proto `tom/{kernel,atomics,composed,queries,sizing,api,index}` | **port** → `lib/tom/` | Product TOM. **No settle**. `decisions`/`mergeTags` stripped (P2 / D082) |
| `composed.cleanupStructure` / `collapseUnary` / `pruneEmptyCons` | **port** → `lib/rulesets/core.js` | Core RuleSet, not atomics |
| `mark2CleanupUnder` / `coerceSameTypeUnder` | **port** → `lib/rulesets/mark2.js` | Mark 2 RuleSet extends core |
| proto `keybinds.mjs` vim-minus-Super table | **reshape** | Shared table is Super-bearing; proto `stripSuper` + overlay `a`/`q` |
| Forge vim kit chords | **reshape** | Same action ids as Mark 2 table; Join chord wins over swap |
| proto `tom/shorthand.mjs` | **port** tests/chat only | Not a CLI/DBus DSL |
| proto `opsets/mark2.mjs` + `mark2.md` | **port** OpSet / **keep** glossary | Binds mark2 RuleSet; no private settle |
| Forge `tree.move` | **discard** | Product Move is Mark 2 Move |
| proto `opsets/transact.mjs` | **port** | Clone/commit with OpSet |
| proto `monitors.mjs` geometry | **reshape** | Host/World, not `lib/tom/` |
| `transferLeafToMonitor` | **reshape** | TreeOps place + Mark 2 max-1 wrap |
| proto `tree.mjs` extras | **park** | Peel/group/focusDir stay proto until needed |
| proto HTML presenter (`render-desk`, keys, storage) | **park** | Possible later settings/tree editor |
| proto `plog.mjs` | **discard** | Forge dual-tape already exists |
| Forge `Node` class | **discard** as TOM | Port fields only (kinds, percent, userSized, lastTabFocusId, placeholder) |
| Forge `Tree` class | **discard** as kernel | Replace with Forest document + Host that *holds* it |
| Forge `Queue` | **discard** | JS array |
| `NODE_TYPES` / `LAYOUT_TYPES` minus PRESET | **keep** names | Same words as Mark 2 |
| `enum.js` | **keep** | Tiny |

## Presenter / Host (from 03–04)

| Piece | Rec | Note |
| --- | --- | --- |
| `tree-layout.js` AABB / wrap | **port** Presenter | gi-free beside TOM; stop percent write-back |
| `tree-layout.js` mins / class floor | **reshape** | Product data + Host learn |
| `Tree.render` / `process*` / `apply` | **reshape** Presenter | Host supplies workarea + `move` |
| `DecorationManager` / D046 | **keep** Presenter | `#forge-tab-chrome` |
| D069 / D030 | **keep** Presenter | Not TOM |
| `wm.move` / `_moveImpl` | **keep** Host | Single `move_resize_frame` chokepoint |
| WindowManager god object | **reshape** | Thin Host + dispatcher. Do not pare in place |
| action-pipeline | **keep** | Focus/Structure stages |
| LayoutController + sensor verify | **keep** | AC1 |
| SourceBag / SignalBag / SuppressFlag | **keep** | Host primitives |
| Lifetime | **keep** | Wire at Host scope (today unused there) |
| WindowAttach | **port** | Finish per-window signals |
| OpenCommitManager | **keep** | Interactive open ≠ ApplyLayout |
| LayoutBatchDepth | **keep** | Caller owns side effects |
| CommandHandler | **reshape** → OpSet surface | Action names stay; bodies call OpSet + commitLayout |
| FocusManager | **reshape** | Pointer→Host; LTF→TOM; reassert→Presenter |
| WorkspaceManager / MonitorManager | **reshape** | Host lists; drop St.Bin/`createNode` |
| GObject on WM/Command/Focus | **discard** | No signals on those classes |

## Strategies to import (not rewrite)

From 03. Epochs 05 may add more.

1. Open-app home: PlaceNext → dock sticky → empty-head → window-actual → LFT
2. OpenCommit quiet vs ApplyLayout (two brains on purpose)
3. D026 restore + overflow rehome (not restore-to-illegal)
4. D044 group home (no auto-peel)
5. H1 dual monitor-resolve + session shield
6. ApplyEpoch sole desired-forest writer
7. AC4 placeholders
8. I3 owning-split
9. action-pipeline formulas
10. Multi-path raise; open leaf ≠ keyboard focus
11. DING admit-time ignore + share renormalize (scan item ding)

## Epochs (from 05)

| Piece | Rec | Note |
| --- | --- | --- |
| ApplyEpoch gate + skip-H1 | **keep** | Sole desired-forest writer while live |
| Slot machines + in-slot hard + forest-match ok | **keep** | Not TOM |
| Open into slot / PH | **keep** | PlaceNext stays Host |
| `planReconcile` | **reshape** | Stay gi-free; split IR vs claim vs compile. No `cli/` port |
| Planner → TOM snapshot | **park** | Later; actions→RunSteps is enough for lift |
| Placeholders / pin / overlay | **keep** beside tree | Not TOM kinds |
| D070 failsafe / chaos | **park** | Never kernel |
| Belt / Mode B cold | **discard** | |
| Session portable | **reshape** (P5b) | Identity adapter on epoch document; keep strict mon |
| Richness / 12s hold / shield | **keep** | Distinct dual-head races |
| T6 capture/restore | **port** (P5a) | `lib/epochs/` windowId document; adapter `tree-snapshot.js` |
| `resolveTargetMonitor` vs `resolveStrictMonitor` | **keep** both | Do not merge |
| Last-good + T7 + workareas classify | **keep** Host | |
| `layout_plan.py` | **park** | Oracle / leftover CLI |
| GetTree `projectForest` | **keep** Surface | Stop treating as TOM snapshot |

## Surfaces (from 06)

| Piece | Rec | Note |
| --- | --- | --- |
| keybindings / command | **reshape** | OpSet names; no LTF field writes |
| drop-zones / drop-intent | **keep** | Gesture math + preflight |
| drag-drop gesture / tab chrome | **keep** | |
| `_executeDropOperation` | **discard** as mutator | Zone → Mark 2 Join/Move |
| run-steps | **port** | One dispatcher |
| DBus product methods | **keep** | See 06 list |
| LayoutBatch as product entry | **park** / **discard** | ApplyLayout owns reconcile |
| LFT / open-min | **port** | Launch/Join policy |
| Python leftover layout CLI | **park** | CN14/CN15 |

## Plan scan

Merge complete: [`explore/07-plan-scan.md`](./explore/07-plan-scan.md).
PRIORITY rebuilt. Closed spines archived.
