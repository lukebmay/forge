# Handoff — forge (lukebmay)

**Updated:** 2026-08-28 — **P5 next** (epoch import). **D085** adapters.
**Branch:** **`master`**. Nest **stopped**. **Push:** only if the human asks.

## Pain

P1–P4 kernel lift + D085 adapters. Next **P5**: epoch import onto
TOM snapshots. Do not merge the two monitor-resolves. Do
not rescan `tree.js`/`window.js` — use `explore/05-apply-recovery.md`.
CommandHandler / shipping vim kit is **P6**. Do not put Mutter/DOM in
the kernel (D085).

**Kernel** = `lib/tom/` + `lib/rulesets/` + `lib/opsets/` + keybind
action ids (`lib/keybinds/`). Language-portable contract; JS is the
reference impl.
**World** = `lib/world/` (host adapter **fills**). **Slot math** =
`lib/presenter/` `paneRect`.
**Adapters:** ForgeAdapterGnome (GJS `WindowManager` façade) /
ForgeAdapterWebView (proto desk); KeybindAdapterGnome /
KeybindAdapterWebView (`stripSuper` ∪ overlay).
Product Move **is** Mark 2 Move. Glossary =
[`mark2.md`](../prototypes/container-motion/src/opsets/mark2.md).

## Next session

**Plan:** [`plans/forge-firm-abstractions.md`](./plans/forge-firm-abstractions.md)
**Locks:** [`layers.md`](./plans/forge-firm-abstractions/layers.md) ·
[`ruleset.md`](./plans/forge-firm-abstractions/ruleset.md) ·
[`keybinds.md`](./plans/forge-firm-abstractions/keybinds.md) ·
D079 / D080 / D081 / D082 / D083 / D084 / **D085**

| Slice | Disk |
| --- | --- |
| P1a | [`P1a.md`](./plans/forge-firm-abstractions/P1a.md) · `lib/tom/` |
| P1b | [`P1b.md`](./plans/forge-firm-abstractions/P1b.md) · `lib/rulesets/` |
| P1c | [`P1c.md`](./plans/forge-firm-abstractions/P1c.md) · `lib/keybinds/` |
| P2 | [`P2.md`](./plans/forge-firm-abstractions/P2.md) · `lib/session/` |
| P3 | [`P3.md`](./plans/forge-firm-abstractions/P3.md) · `lib/world/` · `lib/presenter/` |
| P4 | [`P4.md`](./plans/forge-firm-abstractions/P4.md) · `lib/opsets/` |

**Brake (P4, orchestrator re-ran):**
`cd prototypes/container-motion && npm test` → **154**.
Vitest opsets **3** + world **6** + presenter **2** + session **6** +
keybinds **9**.

### Do (P5)

1. Epoch import onto TOM snapshots. Map:
   [`explore/05-apply-recovery.md`](./plans/forge-firm-abstractions/explore/05-apply-recovery.md).
   Three writers stay three (Apply / session-strict / H1-majority).
2. First bite is T6-shaped capture as TOM snapshot (strip Meta/St from
   the **pure** module). Do not merge `resolveTargetMonitor` and
   `resolveStrictMonitor`.
3. Keep proto tests green (154+). Architecture reshape → **Grok 4.6**.
4. Do **not** wire CommandHandler or rewrite `keybind-presets.js` (P6).

### Do not

- Pare GObject `Node` / `window.js` in place (import onto TOM)
- Merge `resolveTargetMonitor` (H1) and `resolveStrictMonitor` (session)
- `lib/shared/keybind-presets.js` / `command.js` (P6; Join chord still swap)
- A second glossary or a second chord table
- Ding / Super+2 / vinyl / D069 / unify raise
- Commit or push unless asked
- Re-do P2–P4 (session/world/opsets homes stay)

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

## Open (do not block P5)

1. WINDOW identity in TOM (Meta vs id vs both)

## Where context lives

| What | Where |
| --- | --- |
| Layers / import | [`layers.md`](./plans/forge-firm-abstractions/layers.md) · [`import-map.md`](./plans/forge-firm-abstractions/import-map.md) |
| Explore notes | [`explore/`](./plans/forge-firm-abstractions/explore/) — open instead of rescanning |
| Design | [`design.md`](./design.md) · [`CHANGELOG.md`](./design/CHANGELOG.md) |
