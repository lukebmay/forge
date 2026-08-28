# forge-firm-abstractions — Firm kernel, then import

**Status:** accepted — **P1a next** (begin implement)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-27

## Goal

Define **firm abstraction lines** for Forge (TOM / TreeOps / OpSet /
presenter / host / epochs / surfaces). Build the kernel as a **pure shared
TOM** (the same tree the prototype already has). Then **import** practical
surfaces from today’s Shell tree into that architecture — do not
meticulously pare `tree.js` / `window.js` until they become TOM.

## Meeting decision (locked this session)

**Option 2**, with a precise meaning:

| This is | This is not |
| --- | --- |
| New foundational architecture first (TOM already exists in proto) | Throw away layout apply, H1, session restore, CLI, chrome |
| Relentless SoC: kernel has no Mutter, no GObject, no paint, no OpSet policy | A second glossary beside Mark 2 |
| Import old **surfaces and strategies** onto the new kernel | Line-by-line rewrite of 7.5k `window.js` in place |
| One TOM for proto + Forge proper | Proto-only toy that later “inspires” a different Shell tree |

**Why not option 1:** lifecycle bags, canonical contracts, FCC extracts, and
the contracts catalog already tried “refine until the lines appear.”
`Node` still owns Meta/St/decoration; `WindowManager` is still the event
hub + policy + paint scheduler. The wrong object is the center of gravity.

## Acceptance

- [x] Exploration corpus exists under `agents/plans/forge-firm-abstractions/`
      (INDEX + per-domain notes). Later agents must not rescan `tree.js` /
      `window.js` / proto TOM from scratch to learn the map.
- [x] Target layers are named, with allowed/forbidden contents, in
      `layers.md` and `agents/design.md`.
- [x] Import map: keep / port / discard / park for each major old surface.
- [x] Execution slices on this plan (kernel lift, presenter adapter,
      OpSet port, epoch import, surface import).
- [x] **Plan scan:** every still-open plan, blocker, and idea is **close**,
      **abandon**, or **pull in** (refactor or explicit post-refactor).
      PRIORITY rebuilt from that scan — no shadow lists.
- [x] CHANGELOG row(s) for the meeting lock. Mark 2 glossary stays in
      `prototypes/container-motion/src/opsets/mark2.md`.

## Implementation slices

| Slice | What | Status |
| --- | --- | --- |
| **P0a** | Exploration scheme + parallel notes | done |
| **P0b** | Synthesize `layers.md` + `import-map.md` | done |
| **P0c** | Open-plan scan → PRIORITY/HANDOFF | done |
| **P0d** | `agents/design.md` + CHANGELOG D079 | done |
| **P1a** | Lift proto `src/tom/` data+atomics+composed (no settle) → `lib/tom/` | next |
| **P1b** | `lib/rulesets/{core,mark2}.js`; proto tests call the same settle | ready |
| **P1c** | `lib/keybinds/` Mark 2 Super-bearing table; proto `stripSuper` + `a`/`q`; CI: proto ≡ stripSuper(Forge) for shared ids | ready |
| **P2** | Strip `decisions`/`mergeTags` off kernel; Host holds a Forest | ready |
| **P3** | Presenter adapter (stop `Node.rect`/decoration in TOM) | ready |
| **P4** | OpSet port (Mark 2) onto `lib/tom` + RuleSet — product Move **is** Mark 2 | ready |
| **P5** | Epoch import (Apply / session / H1) onto TOM snapshots | ready |
| **P6** | Surface import (DnD/DBus/host overlays) → OpSet action ids | ready |

**P1a acceptance:** `lib/tom/` is the proto kernel source; proto tests
import it (shim OK); `cd prototypes/container-motion && npm test`
green; Forge `tree.js` untouched. Settle may still live in `composed`
until P1b.

P1b/P1c before Shell Move so proto and Forge cannot drift.

## Working weight

| Path | Role |
| --- | --- |
| [INDEX.md](./forge-firm-abstractions/INDEX.md) | Map of notes — start here |
| [explore/00-scheme.md](./forge-firm-abstractions/explore/00-scheme.md) | How notes are written |
| `explore/01-…` | Domain notes (token-saving references) |
| [layers.md](./forge-firm-abstractions/layers.md) | Target abstraction lines |
| [ruleset.md](./forge-firm-abstractions/ruleset.md) | RuleSet module (D080) |
| [keybinds.md](./forge-firm-abstractions/keybinds.md) | Shared chord table (D080) |
| [import-map.md](./forge-firm-abstractions/import-map.md) | Keep / port / discard |

## Context for the next agent

- Proto kernel: `prototypes/container-motion/src/tom/` (gi-free, presenter-free).
- Mark 2 glossary: `prototypes/container-motion/src/opsets/mark2.md` (FIRM).
- Forge contamination: `lib/extension/tree.js` `Node` extends GObject and
  constructs decorations/actors in the constructor.
- God-object sizes (lines): `window.js` ~7459, `layout-plan.js` ~5256,
  `session-api.js` ~4952, `drag-drop.js` ~4222, `tree.js` ~3962.
- Existing locks that **stay** as product strategy unless the import map
  says otherwise: D023 child-list, D039–D044 apply, D069 tab geometry,
  H1 dual monitor-resolve, D036 gi-free `lib/shared/`.
- D073/D074/D079/D080: TOM+atomics core; RuleSet settle; Mark 2 OpSet;
  one Super-bearing keybind table.

## Session note

**2026-08-27e:** Handoff prepped. Next session **begins P1a**. No
implement this commit.

**2026-08-27d:** D080 — RuleSet is a **module** (core vs mark2 settle);
unary after breakout is RuleSet not a second Promote. Shared keybind
table is Super-bearing; proto stripSuper + `a`/`q`. Product Move = Mark 2
Move. MONITOR max-1 = mark2 RuleSet after settle.

**2026-08-27c:** Planning **done**. D079 locked. Scan merge complete.
PRIORITY rebuilt. Closed/abandoned spines archived this session. Next
implement = **P1** `lib/tom/` lift. Open questions for the operator:
MONITOR max-1 vs n-child; Forge move vs Mark 2 Move; WM vs ForgeHost name.

**2026-08-27b:** Plan scan is a **batched pipeline**, not one agent.
Monolith “Scan all open plans” **killed**. Pickup:
[`scan/00-pipeline.md`](./forge-firm-abstractions/scan/00-pipeline.md) +
[`scan/INVENTORY.md`](./forge-firm-abstractions/scan/INVENTORY.md).

**2026-08-27:** Planning meeting started. Option 2 locked (kernel-first,
then import).
