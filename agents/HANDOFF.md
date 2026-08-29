# Handoff — forge (lukebmay)

**Updated:** 2026-08-28 — **P6a done.** **D087 / D088 / D090 locked.**
Next **P7** (forest envelope + key overlays) or P6 remainder on TILES.
**Branch:** **`master`**. Nest **stopped**. **Push:** only if the human
asks.

## Pain

Kernel is generic; adapters **extend** it (D085/D087/D088). Forest
document = **META + FLOATS + TILES**. FLOAT windows are not under a
MONITOR (they can span heads). P6a skip-untiled is the stopgap until
P7. Join chord wins over swap. Do not merge the two monitor-resolves.
Do not retarget Apply onto T6. Do not put Mutter/DOM in the kernel.

**Kernel** = `lib/tom/` + `lib/rulesets/` + `lib/opsets/` + keybind
action ids (`lib/keybinds/`). Language-portable contract; JS is the
reference impl.
**World** = `lib/world/` (host adapter **fills**). **Slot math** =
`lib/presenter/` `paneRect`.
**Epochs** = `lib/epochs/` (T6 document + H1 majority resolve).
**Adapters:** ForgeAdapterGnome (GJS `WindowManager` façade) /
ForgeAdapterWebView (proto desk); KeybindAdapterGnome /
KeybindAdapterWebView (kernel table ∪ host overlay).
**P6a live projection:** `lib/extension/tom-live.js` (GObject ↔ TOM;
skip FLOAT/GRAB_TILE/minimized until FLOATS exists).
Product Move **is** Mark 2 Move. Glossary =
[`mark2.md`](../prototypes/container-motion/src/opsets/mark2.md).

**Size** (D090) = **percent** or **`share`**. `share` splits leftover
unused space among other `share` siblings. **FLOAT window** = FLOATS
bag. Do not say float or “spread” for leftover size.

## Next session

**Plan:** [`plans/forge-firm-abstractions.md`](./plans/forge-firm-abstractions.md)
**Locks:** [`layers.md`](./plans/forge-firm-abstractions/layers.md) ·
[`keybinds.md`](./plans/forge-firm-abstractions/keybinds.md) ·
D079–**D090**

| Slice | Disk |
| --- | --- |
| P1–P4 | `lib/{tom,rulesets,keybinds,session,world,presenter,opsets}/` |
| P5 | [`P5.md`](./plans/forge-firm-abstractions/P5.md) · `lib/epochs/` |
| P6a | [`P6.md`](./plans/forge-firm-abstractions/P6.md) · `lib/extension/tom-live.js` |
| P7 | [`P7.md`](./plans/forge-firm-abstractions/P7.md) |

**Brake (P6a, orchestrator re-ran):**
`cd prototypes/container-motion && npm test` → **154**.
Vitest tom-live **4** + mark2-table **10** + keybind-presets **38** +
CommandHandler **82** + Keybindings **58** + WindowManager-commands
**41** + structure-one-commit **6** + opsets **3** + world **6** +
presenter **2** + session **6** + epochs **10**.

### Do

1. **P7** forest envelope (META + FLOATS + TILES) and/or D088 overlay
   wiring (Gnome `Super+q` quit; WebView overlay Super-bearing).
   Architecture reshape → **Grok 4.6**.
2. P6 remainder may continue on TILES: size / toggleSplit / promote
   CommandHandler; DnD execute → OpSet. Same kernel ids.
3. Keep proto tests green (154+).
4. Do **not** retarget Apply onto T6. Do **not** merge monitor-resolves.

### Do not

- Put FLOAT windows under MONITOR
- Pare GObject `Node` / `window.js` in place
- Merge `resolveTargetMonitor` and `resolveStrictMonitor`
- Planner → TOM / Apply GetTree rewrite (P5c parked)
- A second glossary or a second Mark 2 chord table
- Import WebView overlay into Gnome (or the reverse)
- Ding / Super+2 / vinyl / D069 / unify raise
- Commit or push unless asked
- Re-do P2–P6a

## D090 size (do not rediscover)

A TILES child’s size is a **percent** or **`share`**. Share children
split leftover (100% minus percent children) equally. Code may keep
`percent` + `userSized` (`false` = share). Not FLOAT. D089 “spread” is
superseded.

## D088 key overlays (do not rediscover)

Kernel table = Mark 2 Super-bearing ids. Each KeybindAdapter ∪ overlay.
WebView: `Super+a` launch toy, `Super+q` remove (`stripSuper` → `a`/`q`).
Gnome: `Super+q` quit/close app; lock/zoom/run/prefs. Safe/i3 = Gnome
overlays on the **same kernel ids**.

## D087 forest envelope (do not rediscover)

FOREST → META + FLOATS + TILES. TILES = today's ROOT→WS→MONITOR.
FLOATS = unmanaged WINDOW* (may span monitors). Mark 2 mutates TILES
only. Session/world stay WeakMaps, not META children.

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
`Alt+hjkl`/`yuio`/`nm,.`/`/`/`7890`. **P6a shipped** those
focus/move/join/parent/child chords on the vim kit; `window-swap-*` is
the Join surface. Overlay chords (`a`/`q`/quit) are **D088**, not kit.

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
Adapters **extend** the kernel; they do not fork it.

## Open (do not block P6 remainder)

1. WINDOW identity on live Forge `Node` (Meta vs id) — snapshot is D086
2. Live dconf vim users still have Super+a until they reload the kit
3. Forest envelope not in code yet (D087 / P7)
4. WebApp overlays beyond proto `a`/`q` — later, not P7-blocking

## Where context lives

| What | Where |
| --- | --- |
| Layers / import | [`layers.md`](./plans/forge-firm-abstractions/layers.md) · [`import-map.md`](./plans/forge-firm-abstractions/import-map.md) |
| Explore notes | [`explore/`](./plans/forge-firm-abstractions/explore/) — open instead of rescanning |
| Design | [`design.md`](./design.md) · [`CHANGELOG.md`](./design/CHANGELOG.md) |
