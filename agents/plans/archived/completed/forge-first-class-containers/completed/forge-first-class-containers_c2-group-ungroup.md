# forge-first-class-containers_c2-group-ungroup — Explicit group / ungroup (I2)

**Status:** done  
**Plan:** [forge-first-class-containers](../../forge-first-class-containers.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-17  
**Agent:** Grok 4.6 implementer (orchestrator-assigned)

## Goal

Ship **explicit** `group` / `ungroup` as named ops (invariant **I2**: flatten
is explicit only). Wire command/keybind path + CLI/RunSteps. Cut silent CON
invent where safe. Do **not** open C3/C4/R1.

## Acceptance

- [x] Named APIs on Tree (or WM thin wrappers): **group** + **ungroup**
      - `group`: wrap focused unit + partner (or siblings per existing
        `WindowMergeGroup` policy) into a CON; default layout **TABBED**
        (STACKED when stacked mode / opts say so). Prefer extending
        `mergeWindowsIntoGroup` rather than a twin path.
      - `ungroup`: dissolve a CON by promoting children to the grandparent
        (order preserved); no-op on MONITOR/ROOT; does **not** peel
        Meta windows off mon.
- [x] `docs/dev/contracts.md` rows for group + ungroup (extend catalog;
      no twin helpers).
- [x] Command handlers call the named APIs (`WindowMergeGroup` → group;
      new **ungroup** command + settings key + kit binding if missing).
- [x] CLI / RunSteps: `ungroup` verb (and `group` if not already covered by
      `merge-group`). Thin client only — no layout port to `cli/`.
- [x] **I2 unit tests:** ungroup dissolves CON and preserves child identity
      order; mode-only `setLayout` still does not flatten (C1); accidental
      silent dissolve of multi-child user groups is not the happy path.
- [x] **REG-auto-exit-tabbed:** decide + note in plan registry — keep only if
      it is single-child chrome exit (layout field / strip drop), **not** a
      substitute for explicit multi-child ungroup. Do not invent new silent
      multi-child flatten.
- [x] L0 green for touched suites. Nest only if JS needs live prove:
      `./scripts/forge/forge-test nested run -- …` (auto stop). Never
      personal `dev`/`t1` in matrix; only `_forge-test-*`.
- [x] Overwrite this session note + update FCC plan session note + PRIORITY
      when done. Move this file to
      `agents/plans/forge-first-class-containers/completed/` on ship.

## Context for the next agent (complete + succinct)

### Locked (do not re-litigate)

- D039–D044 (slot machines, overlay=all-hard, belt deleted, mon-local groups).
- C1 `setLayout` I1 — mode change never flattens.
- D045 user CLI: nest/live = `./scripts/forge/forge-test` only. Never teach
  `forge test` / top-level `forge nested`.
- Child list: `Node.appendChild` / `insertBefore` / `removeChild` /
  `replaceChildren` only.
- Group create already exists: `tree.mergeWindowsIntoGroup` + command
  `WindowMergeGroup` + RunSteps `merge-group` + keybind `window-merge-group`.
- D044: `groupHomeMonitor` + `normalizeGroupToHomeMonitor` on join.

### Entry points

| Concern | Path |
| --- | --- |
| Named group | `lib/extension/tree.js` `group` → `mergeWindowsIntoGroup` |
| Named ungroup | `lib/extension/tree.js` `ungroup` |
| Command | `lib/extension/command.js` `WindowMergeGroup` / `WindowUngroup` |
| Session / RunSteps | `session-api.js` `_mergeGroupOp` / `_ungroupOp`; ops `group` + `ungroup` |
| Settings keys | `lib/shared/settings-keys.js` `window-ungroup` |
| Keybind kits | `lib/shared/keybind-presets.js` `Ctrl+Shift+Super+m` |
| Contracts | `docs/dev/contracts.md` |
| Auto-exit single tab | `tree.js` `removeNode` + `auto-exit-tabbed` (**kept**) |
| C1 completed | `agents/plans/forge-first-class-containers/completed/…_c1-set-layout.md` |

### Proven

- C0 monocle deleted; C1 setLayout I1 + guards green.
- C2 I2: ungroup one CON, order + nested CON identity preserved.
- Tab click-drag PR1–PR15 unit-shipped (do not reopen).
- Nest `running: False` at ship.

### Failed / traps

- Do **not** call `_layoutOp` / `_flattenLayoutParentToWindows` from user
  group/ungroup (REG-ensure-flatten stays profile/ensure-only).
- Do **not** auto-peel on mixed-mon groups (D044 normalize keeps group).
- Do **not** close host ghostty windows used by durable Grok leaders.
- Host tip may lag tip until operator reload — prefer nest for JS prove.

### Enable / test

```bash
npm test -- tests/unit/tree/ungroup-i2.test.js \
  tests/unit/tree/set-layout-i1.test.js \
  tests/unit/tree/Tree-operations.test.js \
  tests/unit/command/CommandHandler.test.js
```

### Risks

- `cleanTree` / close-path single-child CON collapse is lifecycle cleanup,
  not product ungroup — do not break close.
- PRIORITY: strip `_layoutOp` flatten is **P3 after C2** — still out of scope.

## Session note

**2026-08-17 C2 shipped on master (uncommitted; operator did not ask).**

### API

| Surface | Path | Behavior |
| --- | --- | --- |
| `Tree.group(a, b, layout?, opts?)` | `lib/extension/tree.js` | Named I2 create; calls `mergeWindowsIntoGroup`. Default TABBED; STACKED when stacked mode + `dnd-center-layout` stacked, or opts |
| `Tree.ungroup(node)` | same | Dissolve one CON; children → grandparent, order kept. WINDOW uses parent CON. No-op MONITOR/ROOT/WORKSPACE. Not recursive flatten; not Meta mon peel |
| `WindowMergeGroup` | `command.js` | Calls `tree.group` (partner policy unchanged) |
| `WindowUngroup` | `command.js` | Calls `tree.ungroup`; commit `window-ungroup` |
| RunSteps | `merge-group` + alias `group`; new `ungroup` | Session `_mergeGroupOp` / `_ungroupOp` |
| Keybind | `window-ungroup` | All kits: `Ctrl+Shift+Super+m` (twin of merge) |

### REG-auto-exit-tabbed

**Keep.** `removeNode` + `setLayout` + strip drop when a TABBED CON has one
child left. Chrome/layout only — does **not** promote the last child to the
grandparent and does **not** flatten multi-child groups. Product ungroup is
`tree.ungroup`.

### vs I2 (not product ungroup)

| Path | Why keep |
| --- | --- |
| `auto-exit-tabbed` | Single-child chrome exit |
| `Node.resetLayoutSingleChild` | Layout stamp after partner leaves |
| `cleanTree` single-child CON collapse | Lifecycle unwrap CON[CON[win]] |
| `_layoutOp` flatten | REG-ensure-flatten (P3 after C2) |

Silent CON invent **not cut**: `split` / slot-split / DnD wrap / `_layoutOp`
wrap are required structure or profile ensure. No new silent multi-child flatten.

### Tests

New: `tests/unit/tree/ungroup-i2.test.js` (10). Also CommandHandler ungroup,
session ungroup, RunSteps `group`/`ungroup`.

```bash
npm test -- tests/unit/tree/ungroup-i2.test.js \
  tests/unit/tree/set-layout-i1.test.js \
  tests/unit/tree/Tree-operations.test.js \
  tests/unit/command/CommandHandler.test.js \
  tests/unit/extension/session-api-layout-cycle.test.js \
  tests/unit/extension/run-steps.test.js \
  tests/unit/keybindings/Keybindings.test.js \
  tests/unit/shared/keybind-presets.test.js
# 302 passed
```

Nest: **not run** (structure unit-proven). `nested status` → `running: False`.

### Do not

- No C3/C4/R1
- No `_layoutOp` from user group/ungroup
- Uncommitted (operator did not ask to commit)
