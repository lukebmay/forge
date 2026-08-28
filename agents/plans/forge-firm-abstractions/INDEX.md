# Firm-abstractions corpus — start here

**Purpose:** token-saving references so later agents do **not** rescan
`tree.js` / `window.js` / proto TOM / apply / recovery from scratch.

**Rule:** if you need the map of a domain, **open the note**. Only re-open
source when implementing or when a note’s “as of” date is stale vs git.

**As of:** 2026-08-27 (planning meeting)

## How to use

1. Read [explore/00-scheme.md](./explore/00-scheme.md) once (template +
   vocabulary).
2. Open the domain note below.
3. For *why* the layers exist: `agents/design.md` (after P0d) and
   [layers.md](./layers.md) (after P0b).
4. For *what to port*: [import-map.md](./import-map.md) (after P0b).
5. Glossary for tiling words: Mark 2
   [`src/opsets/mark2.md`](../../../prototypes/container-motion/src/opsets/mark2.md)
   — do not invent a second one.

## Notes (fill during P0a)

| Note | Domain | Status |
| --- | --- | --- |
| [explore/00-scheme.md](./explore/00-scheme.md) | How to write notes | done |
| [explore/01-proto-tom.md](./explore/01-proto-tom.md) | Proto TOM kernel, TreeOps, OpSet boundary | done |
| [explore/02-forge-tree.md](./explore/02-forge-tree.md) | `tree.js` Node/Tree — model vs GObject/Meta/paint | done |
| [explore/03-window-wm.md](./explore/03-window-wm.md) | `window.js` + command/focus — event hub domains | done |
| [explore/04-presenter.md](./explore/04-presenter.md) | Render/apply, tree-layout, decoration, tab chrome | done |
| [explore/05-apply-recovery.md](./explore/05-apply-recovery.md) | ApplyEpoch, slot machines, H1, session layout | done |
| [explore/06-surfaces-twins.md](./explore/06-surfaces-twins.md) | DnD, open, CLI/DBus, contracts vs twins | done |
| [explore/07-plan-scan.md](./explore/07-plan-scan.md) | Close / abandon / pull-in every open plan | **MERGE: complete** |

## Plan scan (token-safe pipeline)

One agent for all plans was **killed** (would write one file at the end).
Use this instead:

| Path | Role |
| --- | --- |
| [scan/00-pipeline.md](./scan/00-pipeline.md) | Levels, verdicts, pickup |
| [scan/INVENTORY.md](./scan/INVENTORY.md) | Every id + batch. Done = `items/<id>.md` exists |
| `scan/items/<id>.md` | **One verdict per plan**, written immediately |
| `scan/batches/B01.md` … `B04.md` | Ledgers |

**Resume:** missing item files only. Do not re-read done ids.

## Synthesis (P0b)

| File | Role | Status |
| --- | --- | --- |
| [layers.md](./layers.md) | Target layers: allowed / forbidden / owner | locked D079 + D080 |
| [import-map.md](./import-map.md) | Keep / port / discard / park per old surface | locked for P1 |
| [ruleset.md](./ruleset.md) | RuleSet is a module; core vs mark2 settle | locked D080 |
| [keybinds.md](./keybinds.md) | Shared Super-bearing table; proto stripSuper | locked D080 |

## Do not put here

- Mark 2 rule changes (those belong in `mark2.md` + code + tests).
- Session chatter (HANDOFF / this plan’s session note).
- Full file dumps. Cite `path:symbol` + a short worked example.
