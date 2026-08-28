# Handoff — forge (lukebmay)

**Updated:** 2026-08-27 — **begin P1a** (TOM lift)
**Branch:** **`master`**. Nest **stopped**. **Push:** only when human asks.
**Active stream:** **implement** firm abstractions. Not proto desk bugs.

## Pain (read this first)

Planning is **done**. Next work is **P1a**: the same TOM in proto and
Forge. Do not rescan `tree.js`. Do not port Mark 2 into Shell Move.

**Core** = TOM + atomics + composed. **RuleSet** = settle module (P1b).
**Keybinds** = one Super-bearing table (P1c). Product Move **is** Mark 2
Move. Glossary =
[`mark2.md`](../prototypes/container-motion/src/opsets/mark2.md).

## Next session — P1a only

**Plan:** [`plans/forge-firm-abstractions.md`](./plans/forge-firm-abstractions.md)
**Start here:** [`plans/forge-firm-abstractions/INDEX.md`](./plans/forge-firm-abstractions/INDEX.md)
**Locks:** [`layers.md`](./plans/forge-firm-abstractions/layers.md) ·
[`ruleset.md`](./plans/forge-firm-abstractions/ruleset.md) ·
[`keybinds.md`](./plans/forge-firm-abstractions/keybinds.md) · D079/D080

### Do

1. Lift `prototypes/container-motion/src/tom/` → `lib/tom/` (gi-free ESM,
   same pattern as `lib/shared/`).
2. Point proto at `lib/tom` (re-export shim in `src/tom/` is fine).
3. Brake: `cd prototypes/container-motion && npm test` still green.
4. Stop. P1b (RuleSet extract) and P1c (keybind table) are **next
   slices**, not this one unless P1a is trivial leftover time.

Settle functions may still sit in `composed` after P1a. **P1b** moves
them to `lib/rulesets/{core,mark2}.js`. Do not split RuleSet as a
side quest inside P1a.

### Do not

- Edit `lib/extension/tree.js` / `window.js` (Forge still on old Node)
- Put Launch, keybinds, Meta, GObject, or presenters in `lib/tom/`
- A second glossary; a second Mark 2 chord table; keep `tree.move` as a
  twin OpSet
- Resume ding / Super+2 / vinyl / D069 tip
- Merge T6 majority resolve with session strict
- Unify raise; push unless the human asks

### P1a done when

- [ ] `lib/tom/` exists and is the source of the proto kernel
- [ ] proto tests import that kernel (directly or via shim)
- [ ] `cd prototypes/container-motion && npm test` green
- [ ] Forge extension still loads the old tree (no Shell port)

**Default implementer:** Grok 4.5. Architecture reshape → 4.6.

## Where context lives

| What | Where |
| --- | --- |
| Layers + import | [`layers.md`](./plans/forge-firm-abstractions/layers.md) · [`import-map.md`](./plans/forge-firm-abstractions/import-map.md) |
| Domain notes | [`explore/`](./plans/forge-firm-abstractions/explore/) — open instead of rescanning |
| Scan merge | [`explore/07-plan-scan.md`](./plans/forge-firm-abstractions/explore/07-plan-scan.md) |
| Mark 2 glossary | [`mark2.md`](../prototypes/container-motion/src/opsets/mark2.md) |
| RuleSet / keys | [`ruleset.md`](./plans/forge-firm-abstractions/ruleset.md) · [`keybinds.md`](./plans/forge-firm-abstractions/keybinds.md) |
| Locks | [`design.md`](./design.md) · [`CHANGELOG.md`](./design/CHANGELOG.md) (D079, D080) |

## Open (do not block P1a)

1. WINDOW identity in TOM (Meta vs id vs both during adapter)
2. Keep GJS name `WindowManager` vs `ForgeHost`
