# forge-tom-agree-resync — AGREE / DRIFT / RESYNC

**Status:** archived completed — R0–R4+R6 shipped; host proof PASS
**Superseded for dual child-list / present leftovers by:**
[forge-retire-gobject-topology](../../forge-retire-gobject-topology.md) (**D096**)
**Optional R5** (PresenterOps types) may land under retire G2/G5 if needed.
**Branch:** master
**Lock:** **D093** (stands; D096 clarifies Meta=reality vs TOM=belief)
**Blocker:** (none)
**Updated:** 2026-08-31 — archived with cutover

## Goal

Name and implement **AGREE / DRIFT / RESYNC** so Mark 2 and host events
cannot run against a lie. One topology (TOM Forest). Presenter is
`present` / `observe`. RESYNC applies **TOM-only** atomics + RuleSet
**toward REALITY**; FLOAT terminates. No second tiling tree.

## Acceptance

- [x] D093 + `design.md` + CHANGELOG + this plan
- [x] Pure `agree(forest, facts)` with unit tests
- [x] After apply **and** close: resync (TOM + RuleSet + present)
- [x] Host destroy/map enter RESYNC (not GObject-first topology)
- [x] Mark 2 / `runLiveForest` gated on AGREE
- [x] C5 mins loop is inside RESYNC (not a twin architecture)
- [x] Hunt tokens: `metric agree` / `metric drift` / `metric resync`
- [x] Proto brake 154; no twin `AtomicsGnome`

## Implementation slices

| Slice | Status | What |
| --- | --- | --- |
| **R0** | **done** | Design lock D093 |
| **R1** | **done** | Pure `agree` + `facts` shape (existence, float, mon, mins, singleton TAB). Units. No Shell wiring |
| **R2** | **done** | After **apply** and **close**: `resyncToReality` = observe → TOM atomics (remove gone / FLOAT if host floated) → RuleSet settle → present. Live bugs: vinyl singleton TABBED; close halved pane; `parentNode is null` |
| **R3** | **done** | Other host events (map, dock, entered-monitor) enter RESYNC. Close leftover if R2 skipped destroy |
| **R4** | **done** | Gate Mark 2 / `runLiveForest` on AGREE (resync first). Fold C5 into the same loop |
| **R5** | optional | PresenterOps types (`present` / `observe`). WebView = `renderDesk`; Gnome = `paintWmForest`. No second child-list |
| **R6** | **done** | GObject `childNodes` not topology: gut id-miss fallbacks / close GObject-ahead. Same as cutover acceptance residue |

**Next session:** leftover nest H5 / toggleTabStack on
[forge-live-layout-dnd-proof](./forge-live-layout-dnd-proof.md). Archive
this plan when the operator wants.

## Non-goals

- Twin AtomicsGnome / AtomicsWebApp
- Pinned-slots / resize-autotile
- Archiving the cutover plan (optional after R2)

## Context for the next agent

- **Law:** `agents/design.md` § TOM ↔ reality (D093). CHANGELOG D093.
- **Today:** Apply/close/map/dock/entered-monitor + Mark 2 enter
  RESYNC. Observe **omits mins by default**; `includeMins: true` on
  Mark 2 gate/post. C5 share-adjust + FLOAT is inside
  `resyncWmToReality` when `includeMins` (not a twin loop after
  paint). Gate uses `skipSingletonSettle` so unary TAB is not unwrapped
  before Join. R6: live seeded writers do not
  `syncForestFromTree` after Forest already wrote. Remaining copy is
  `_syncForestIfSeeded` on Host `tree.move` GObject body and
  `swapPairs` id-miss (`metric fallback`).
- **Do:** TOM atomics + `settleForest` / `mark2CleanupUnder` toward
  observed host facts; then `paintWmForest`.
- **Do not:** Mark 2 while DRIFT; splice GObject then copy Forest;
  invent presenter `appendChild` as topology.
- **Hunt:** `forge log` only (`metric agree|drift|resync`).
- **Brake:** `cd prototypes/container-motion && npm test` → 154.
- **Fail closed:** if R2 cannot make apply/close AGREE on nest/host →
  stop, redesign meeting, no twin trees.

## Session note

2026-08-29: **R6 done.** Live seeded writers no longer copy GObject
`childNodes` onto Forest after Forest already wrote. **Archive
candidate** (required R0–R4+R6 done; R5 optional skip). No commit.

**Gut:** `trackCurrentWindows` cold-seeds only (`ensureLiveForest`
if unseeded) — `trackWindow` already Forest-insert + RESYNC.
`tree.move` sibling-swap no longer `_syncForestIfSeeded` after
Forest-first `swapPairs`. Close stays Forest-first
(`forestRemoveWindow` → RESYNC → `removeNode` → `paintWmForest`);
id-miss close logs `metric fallback op=close`. Delayed `renderTree`
does not call `syncForestFromTree`. `pruneDeadWindows` Forest-removes
when seeded (no GObject→Forest copy).

**Remaining `syncForestFromTree`:** helper in `tom-live.js` (tests).
Live copy only via `_syncForestIfSeeded`: Host `tree.move` GObject
body (`op=move reason=gobject-ahead`; no live `lib/` caller) and
`swapPairs` GObject id-miss (`op=swapPairs reason=ids-miss`).
Unseeded T6 restore / Host bodies kept. `forestReparent` miss on
rehome still GObject-append + `metric fallback op=rehome` (no Forest
copy; entered-monitor RESYNC). Product swap fallbacks also log
`swapLastActive` / `dnd-swap` / `swap`.

**Hunt:** `metric fallback` plus `metric agree|drift|resync`.

**Units:** agree 14, resync 7, observe 8, forest-run 2, tom-live 40,
lifecycle 40 (5 new R6), CommandHandler 80, Tree-operations 70,
prune-dead 5, session-api-layout-cycle 36, workspace, metrics.
Brake **154**. No twin atomics.

**Next:** skip R5 unless asked. Map present lag until renderTree;
mon-mismatch still not a pure resync structural fix. Archive this
plan when wanted.
