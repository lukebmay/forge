# Handoff — forge (lukebmay)

**Updated:** 2026-08-28 — **P6 next** (CommandHandler / vim kit). **P5 done.**
**Branch:** **`master`**. Nest **stopped**. **Wrap-up:** local commit this
session. **Push:** only if the human asks.

## Pain

P1–P5 kernel + adapters + T6/session snapshots. Next **P6**: CommandHandler
and shipping vim kit speak Mark 2 action ids (Join, not swap). Do not
merge the two monitor-resolves. Do not retarget Apply onto T6 (P5c
parked). Do not put Mutter/DOM in the kernel (D085).

**Kernel** = `lib/tom/` + `lib/rulesets/` + `lib/opsets/` + keybind
action ids (`lib/keybinds/`). Language-portable contract; JS is the
reference impl.
**World** = `lib/world/` (host adapter **fills**). **Slot math** =
`lib/presenter/` `paneRect`.
**Epochs** = `lib/epochs/` (T6 document + H1 majority resolve).
**Adapters:** ForgeAdapterGnome (GJS `WindowManager` façade) /
ForgeAdapterWebView (proto desk); KeybindAdapterGnome /
KeybindAdapterWebView (`stripSuper` ∪ overlay).
Product Move **is** Mark 2 Move. Glossary =
[`mark2.md`](../prototypes/container-motion/src/opsets/mark2.md).

## Next session

**Plan:** [`plans/forge-firm-abstractions.md`](./plans/forge-firm-abstractions.md)
**Locks:** [`layers.md`](./plans/forge-firm-abstractions/layers.md) ·
[`keybinds.md`](./plans/forge-firm-abstractions/keybinds.md) ·
D079–**D086**

| Slice | Disk |
| --- | --- |
| P1–P4 | `lib/{tom,rulesets,keybinds,session,world,presenter,opsets}/` |
| P5 | [`P5.md`](./plans/forge-firm-abstractions/P5.md) · `lib/epochs/` |
| P6 | [`P6.md`](./plans/forge-firm-abstractions/P6.md) |

**Brake (P5, orchestrator re-ran):**
`cd prototypes/container-motion && npm test` → **154**.
Vitest epochs **10** + tree-snapshot **25** + session-layout **37** +
opsets **3** + world **6** + presenter **2** + session **6** +
keybinds **9**.

### Do (P6)

1. CommandHandler dispatch of shared action ids → Mark 2 OpSet +
   `commitLayout`. First bite: vim-kit ids (`move.*` / `join.*` /
   `focus.*`), not a full `command.js` rewrite.
2. Shipping `keybind-presets.js` vim kit = Mark 2 table (D081). Join
   chord wins over swap. Safe/i3 = overlays on the same ids.
3. Keep proto tests green (154+). Architecture reshape → **Grok 4.6**.
4. Do **not** retarget Apply onto T6. Do **not** merge monitor-resolves.

### Do not

- Pare GObject `Node` / `window.js` in place
- Merge `resolveTargetMonitor` and `resolveStrictMonitor`
- Planner → TOM / Apply GetTree rewrite (P5c parked)
- A second glossary or a second chord table
- Ding / Super+2 / vinyl / D069 / unify raise
- Commit or push unless asked
- Re-do P2–P5

## D086 T6 snapshot (do not rediscover)

`lib/epochs/` is the T6 algorithm. WINDOW key = `windowId` (string).
Adapter `tree-snapshot.js` attaches `.window` / `.lastTabFocus` Meta for
in-process use. Epochs never read those. Session portable is identity
adapter (`toPortableForest` / `toLiveForest`); `id` = `windowId`.
`resolveStrictMonitor` stays in `session-layout.js`. Live
`Node.nodeValue` is still Meta.

## D084 OpSet (do not rediscover)

`lib/opsets/` is Mark 2. Neighbor queries `lib/world/neighbors.js`
(tie-break **string**). `transferLeafToMonitor` is OpSet place + RuleSet
max-1. Proto `src/opsets/*.mjs` re-export. No proto `plog.mjs` in `lib/`.

## D081 kit (do not rediscover)

Product table = proto right-hand: `hjkl` focus, `Shift+hjkl` Move,
`Ctrl+hjkl` Join, `p`/`Shift+p`, `m`/`n`, `[`/`]`, `{`/`}`,
`Alt+hjkl`/`yuio`/`nm,.`/`/`/`7890`. Overlay only: `a` `q` Delete tags
`f`. Not kit: leftover `yuio` extra-focus, TreeOp swap, old Super+a
parent.

## D082 session (do not rediscover)

`lib/session/` WeakMap keyed by Forest. `sessionOf` / `copySession` /
`attachSession`. Transact copies session around clone+commit. RuleSet
`aspectTieBreak` is a string argument. Old proto dumps peel leftover
fields on first `sessionOf`.

## D083 world (do not rediscover)

`lib/world/` WeakMap keyed by Forest. `worldOf` / `copyWorld` /
`attachWorld` / `geomOf`. Transact copies world. `paneRect` is
`lib/presenter/`. MONITOR nodes have no `geom`. Old dumps peel leftover
`node.geom` on first `worldOf`.

## D085 adapters (do not rediscover)

Kernel ≠ GNOME. Host: **ForgeAdapterGnome** / **ForgeAdapterWebView**.
Keybind: **KeybindAdapterGnome** / **KeybindAdapterWebView**. GJS
`WindowManager` may stay as a façade; the **role** is ForgeAdapterGnome.
Do not rename files this slice.

## Open (do not block P6)

1. WINDOW identity on live Forge `Node` (Meta vs id) — snapshot is D086

## Where context lives

| What | Where |
| --- | --- |
| Layers / import | [`layers.md`](./plans/forge-firm-abstractions/layers.md) · [`import-map.md`](./plans/forge-firm-abstractions/import-map.md) |
| Explore notes | [`explore/`](./plans/forge-firm-abstractions/explore/) — open instead of rescanning |
| Design | [`design.md`](./design.md) · [`CHANGELOG.md`](./design/CHANGELOG.md) |
