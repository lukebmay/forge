# forge-firm-abstractions — Firm kernel, then import

**Status:** archived completed — **P7 done**; post-P7 sole-source archived
**Active deletion pass:** [forge-retire-gobject-topology](../../forge-retire-gobject-topology.md) (**D096**).
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-31 — moved to `archived/completed/`; do not extend P\*

### Post-P7 thin plans (archived / superseded)

| Plan | Role |
| --- | --- |
| [forge-mark2-one-tiles-path](./forge-mark2-one-tiles-path.md) | **archived** T1–T5 |
| [forge-dnd-mark2-complete](./forge-dnd-mark2-complete.md) | **archived** D1–D4 |
| [forge-nest-mark2-invoke](./forge-nest-mark2-invoke.md) | **archived** N1–N3 |
| [forge-live-tom-cutover](./forge-live-tom-cutover.md) | **archived** C0–C7; GObject delete → D096 |
| [forge-tom-agree-resync](./forge-tom-agree-resync.md) | **archived** D093 R0–R6 |
| [forge-retire-gobject-topology](../../forge-retire-gobject-topology.md) | **active P0** — delete GObject topology (G0–G8) |
| [explore/08-tom-sole-source-audit.md](./forge-firm-abstractions/explore/08-tom-sole-source-audit.md) | Historical hybrid evidence (stale vs D096) |

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
| **P1a** | Lift proto `src/tom/` data+atomics+composed (no settle) → `lib/tom/` | done |
| **P1b** | `lib/rulesets/{core,mark2}.js`; proto tests call the same settle | done |
| **P1c** | `lib/keybinds/` Mark 2 Super-bearing table; proto `stripSuper` + `a`/`q`; CI: proto ≡ stripSuper(Forge) for shared ids | done |
| **P2** | Strip `decisions`/`mergeTags` off kernel; Host holds a Forest | done |
| **P3** | Presenter adapter (stop `Node.rect`/decoration in TOM) | done |
| **P4** | OpSet port (Mark 2) onto `lib/tom` + RuleSet — product Move **is** Mark 2 | done |
| **P5** | Epoch import (Apply / session / H1) onto TOM snapshots | **done** (P5c parked) |
| **P6** | Surface import (DnD/DBus/host overlays) → OpSet action ids | **remainder done** (DnD Join/Move mapped) |
| **P7** | Forest envelope META + FLOATS + TILES (D087); key overlay D088 | **done** |

**P1b acceptance:** `lib/rulesets/{core,mark2}.js` owns settle; proto
OpSet binds it; MONITOR max-1 wired; `npm test` 145 green; `tree.js`
untouched.

**P1c acceptance:** `lib/keybinds/` Super-bearing table (D081 right-hand
kit); proto generated from `stripSuper ∪ overlay`; proto **154** green;
vitest mark2-table **9**; `keybind-presets.js` untouched.

**P2 acceptance:** Forest has no `decisions`/`mergeTags`; session bag
`lib/session/`; RuleSet takes `aspectTieBreak` string; proto **154**
green; vitest session **6**; `tree.js` untouched.

**P3 acceptance:** MONITOR nodes have no `geom`; world bag `lib/world/`;
`paneRect` in `lib/presenter/` (not `lib/tom/`); proto **154** green;
vitest world **6** + presenter **2** + session **6** + keybinds **9**;
`tree.js` untouched.

**P4 acceptance:** Mark 2 OpSet at `lib/opsets/`; neighbor queries in
`lib/world/neighbors.js`; proto shims; proto **154** green; vitest
opsets **3** + world **6** + presenter **2** + session **6** +
keybinds **9**; `tree.js` / `command.js` / `keybind-presets.js`
untouched.

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
| [P2.md](./forge-firm-abstractions/P2.md) | P2 working note (D082) |
| [P3.md](./forge-firm-abstractions/P3.md) | P3 working note (D083) |
| [P4.md](./forge-firm-abstractions/P4.md) | P4 working note (lib/opsets) |
| [P5.md](./forge-firm-abstractions/P5.md) | P5 working note (epochs / T6 snapshot) |
| [P6.md](./forge-firm-abstractions/P6.md) | P6 working note (CommandHandler / vim kit) |
| [P7.md](./forge-firm-abstractions/P7.md) | P7 working note (FLOATS/TILES envelope + overlays) |

## Context for the next agent

- Product kernel: `lib/tom/` (gi-free). Proto `src/tom/` re-exports.
- Session bag: `lib/session/` (WeakMap). Not Forest fields (D082).
- World bag: `lib/world/` (WeakMap). MONITOR workarea, not Node.geom
  (D083). Neighbor queries: `lib/world/neighbors.js`. Slot AABB:
  `lib/presenter/` `paneRect`.
- Mark 2 OpSet: `lib/opsets/` (D084). Proto `src/opsets/` re-exports.
- Mark 2 chords: `lib/keybinds/` kernel table (Super-bearing). Each
  KeybindAdapter ∪ overlay (D088). Proto =
  `stripSuper(kernel ∪ WebView overlay)`.
- Forest envelope (D087 / P7): META + FLOATS + TILES. Mark 2 mutates
  TILES. `tom-live` projects FLOAT/GRAB_TILE into FLOATS; DnD commit
  may set `treatGrabTileAsTiles`.
- Mark 2 glossary: `prototypes/container-motion/src/opsets/mark2.md` (FIRM).
- Forge contamination: `lib/extension/tree.js` `Node` extends GObject and
  constructs decorations/actors in the constructor.
- God-object sizes (lines): `window.js` ~7459, `layout-plan.js` ~5256,
  `session-api.js` ~4952, `drag-drop.js` ~4222, `tree.js` ~3962.
- Existing locks that **stay** as product strategy unless the import map
  says otherwise: D023 child-list, D039–D044 apply, D069 tab geometry,
  H1 dual monitor-resolve, D036 gi-free `lib/shared/`.
- D073/D074/D079/D080/D081/D082/D083/D084/D085/**D086**: portable kernel
  (TOM/RuleSet/OpSet/action ids); ForgeAdapterGnome /
  ForgeAdapterWebView; KeybindAdapterGnome / KeybindAdapterWebView;
  session off Forest; world + paneRect off Node; T6 snapshot
  `windowId` in `lib/epochs/`.

## Session note

**2026-08-29e:** **D4.** `_executeDropOperation` removed. Pointer +
synthetic mutate: `_commitResolvedDrop` → Mark 2 or `_commitDropSurface`.
Empty-mon: `_commitEmptyMonitorDrop`.

**2026-08-29d:** **P6 DnD leftover.** Shared `lib/extension/forest-run.js`
`runLiveForest`. DnD commit: `resolveDropMark2` → Mark 2 Join/Move when
mapped (`treatGrabTileAsTiles`); else `_executeDropOperation`. Mapped:
CENTER into adjacent TABBED/STACKED CON **under a CON parent** (join
enter-con); same-parent CON in-axis adjacent edge (move). Fallback:
swap, `shouldMergeCenterGroup` (Join ≠ tab merge), wrap/detach/createCon,
empty-mon, cross-mon, MONITOR-parent edge/CENTER-into-group. Working
note: [`P6.md`](./forge-firm-abstractions/P6.md).

**2026-08-29c:** **P6 remainder done.** CommandHandler `runLiveForest`
dispatches `toggleSplit` / `toggleTabStack` / `promote` /
`promoteRecursive` / `layout.cycle±` / `size.*` on TILES (FLOATS refuse).
Vim kit overlay from `MARK2_TABLE`. Working note:
[`P6.md`](./forge-firm-abstractions/P6.md).

**2026-08-29b:** **P7 done** (Grok 4.6). Envelope META + FLOATS + TILES
in `lib/tom/kernel.js`; `tom-live` projects FLOAT/GRAB_TILE → FLOATS;
WebView overlay Super-bearing; Gnome overlay `host.quit` on `<Super>q`.
Brake proto **154**; forest-envelope **7**; tom-live **7**; mark2-table
**14**. Working note:
[`P7.md`](./forge-firm-abstractions/P7.md).

**2026-08-29:** **D091** leftover-size ids are `size.share*` (not
`size.float*`) in kernel **and** proto. Helpers `shareSize` /
`shareCombo`. Proto `runAction` does not remap `size.float*`.

**2026-08-28l:** **D090** supersedes D089. Size is **percent** or
**`share`** (leftover split among share siblings). Not “spread.”

**2026-08-28k:** **D089** leftover percent is **spread** (not float).
**Superseded by D090.**

**2026-08-28j:** Design lock **D087** (META + FLOATS + TILES) and
**D088** (kernel key table ∪ adapter overlay; WebView `Super+a`/`q`,
Gnome `Super+q` = quit). P7 next kernel. P6 remainder may continue on
TILES.

**2026-08-28i:** **P6a landed** (Grok 4.6). CommandHandler vim-kit ids
→ Mark 2 OpSet + `tom-live` project/apply-back; shipping vim kit from
`MARK2_TABLE` (Join chord wins; Safe/i3 overlays also fire Join on
`window-swap-*`). Orchestrator: skip FLOAT/GRAB_TILE/minimized on
project; hoist extras when dropping a CON. Brake proto **154**;
tom-live **4**. Working note:
[`P6.md`](./forge-firm-abstractions/P6.md).

**2026-08-28h:** Wrap-up **local commit**. P5 done (P5c parked). Next
**P6**. Not pushed.

**2026-08-28g:** **P5 done.** P5b identity adapter landed. P5c
**parked** (Apply stays GetTree). Next **P6**.

**2026-08-28f:** **P5b landed** (Grok 4.6). Session portable as
identity adapter on the epoch document. Keep strict resolve. session-layout
**37**.

**2026-08-28e:** **P5a done** (D086). `lib/epochs/` T6 algorithm
(`windowId`); `tree-snapshot.js` Gnome adapter (Meta extras). Brakes:
epochs **10**, tree-snapshot **25**, session-layout **36**, proto
**154**, kernel vitest **3+6+2+6+9**. Orchestrator re-ran. Next
**P5b**. Working note:
[`P5.md`](./forge-firm-abstractions/P5.md).

**2026-08-28d:** **D085** kernel vs adapters locked (operator). Next
**P5**. Wrap-up commit this session.

**2026-08-28c:** **P4 done** (D084). Mark 2 OpSet `lib/opsets/`; neighbor
queries `lib/world/neighbors.js`; proto `src/opsets/*.mjs` re-export.
Brake proto **154** + vitest opsets **3** + world **6** + presenter
**2** + session **6** + keybinds **9**. Next: **P5** (epochs) / **P6**
(CommandHandler). Working note:
[`P4.md`](./forge-firm-abstractions/P4.md). No commit (human did not
ask).

**2026-08-28b:** **P4 started** (Grok 4.6). Port Mark 2 + transact to
`lib/opsets/`; neighbor math off proto `monitors.mjs`. Do not wire
CommandHandler. Working note:
[`P4.md`](./forge-firm-abstractions/P4.md).

**2026-08-28:** **P3 done** (D083). World bag `lib/world/`; presenter
`paneRect` `lib/presenter/`; MONITOR nodes have no `geom`. Brake proto
**154** (orchestrator re-ran) + vitest world **6** + presenter **2** +
session **6** + keybinds **9**. Next: **P4**. Working note:
[`P3.md`](./forge-firm-abstractions/P3.md). No commit (human did not
ask).

**2026-08-27o:** **P2 done** (D082). Session bag `lib/session/`;
kernel Forest has no `decisions`/`mergeTags`. Brake proto **154** +
vitest session **6** + keybinds **9**. Next: **P3**. Working note:
[`P2.md`](./forge-firm-abstractions/P2.md). No commit (human did not
ask).

**2026-08-27n:** Handoff overwritten for next session. **P2 next.**
Working tree uncommitted on `master` (ahead 3). Do not re-do P1.

**2026-08-27m:** **D081** — vim kit = proto right-hand reach. Table
gained `p`/`Shift+p`, `[`/`]`; dropped leftover `yuio` extra-focus.
Brake proto **154** + vitest **9**. Shipping presets still not
rewritten (P4/P6). Next: **P2**.

**2026-08-27l:** Orchestrator **re-ran** P1c brakes: proto **149**
green, vitest mark2-table **7**. P1 complete. Next session **P2**.
No commit (human did not ask).

**2026-08-27k:** P1c **done**. `lib/keybinds/{actions,mark2,strip-super,proto-overlay}.js`;
proto `defaultVimMinusSuper()` generated; `runAction` shared ids + aliases.
Brake **ALL PASSED (149 cases)** + vitest mark2-table **7**. Shipping vim
kit swap chords **untouched**. Next: **P2**. Working note:
[`P1c.md`](./forge-firm-abstractions/P1c.md).

**2026-08-27j:** P1b **verified green** (orchestrator re-ran 145).
P1c **started** (Grok 4.6). Working note:
[`P1c.md`](./forge-firm-abstractions/P1c.md). Do not rewrite live
vim kit swap chords this slice.

**2026-08-27i:** P1b **done**. `lib/rulesets/{core,mark2}.js`; proto
OpSet imports settle; MONITOR max-1 **wired**; brake **ALL PASSED
(145 cases)**. Next: **P1c**. Working note:
[`P1b.md`](./forge-firm-abstractions/P1b.md).

**2026-08-27h:** P1a **verified green** (orchestrator re-ran 144).
P1b **started** (Grok 4.6). Working note:
[`P1b.md`](./forge-firm-abstractions/P1b.md).

**2026-08-27g:** P1a **done**. Kernel at `lib/tom/*.js`; proto
`src/tom/*.mjs` re-export shims; vite `fs.allow` repo root;
`npm test` **ALL PASSED (144 cases)**. Next: **P1b** RuleSet extract.
Working note: [`P1a.md`](./forge-firm-abstractions/P1a.md).

**2026-08-27f:** P1a **started**. Mechanical lift of proto `src/tom/`
→ `lib/tom/*.js` (Grok 4.5 implementer). Working note:
[`P1a.md`](./forge-firm-abstractions/P1a.md). Do **not** extract
RuleSet (P1b) or strip `decisions` (P2) in this slice.

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
