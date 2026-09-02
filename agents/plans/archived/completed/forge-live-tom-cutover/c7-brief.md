# C7 implementer brief — delete GObject topology authority

**Status:** C7.1–C7.6 done; C7.7 Forest-first restore/H1 next  
**Repo:** `/home/luke/dev/me/forge` · **Branch:** `master`  
**Do not** commit or push unless human asks.

**Depends:** C0–C6.5 + C7.1–C7.6 done (nanoid Forest live; Apply IR from
live Forest without GObject sync; live swap/move Forest-first; restore
identity nanoid + post-restore sync; restore/H1 still GObject-ahead).

**Locks:** D092 — POJO Forest is sole live topology. Big bang. No dual-run steady state. No BC for Meta-as-topology-id.

**Historical C7 brief.** Active work:
`agents/plans/forge-retire-gobject-topology.md` (D096). Archived plan:
`agents/plans/archived/completed/forge-live-tom-cutover.md`.

## Goal

Stop using GObject `Node`/`Tree` child lists as tiling truth. Topology mutations go Forest → paint. Host Meta/St stay in `hostBag`. Retarget finders to bag reverse index. Peel RunSteps / open / bind / DnD to Forest writers. Remove or gut leftover `tree.move` topology mutators once callers are OpSet/Forest.

## Likely touch list (expect races — serialize)

| Area | Paths |
| --- | --- |
| RunSteps → Forest | `run-steps.js`, Apply open/bind/structure callers |
| Tree authority | `tree.js` finders / move / restoreTree* |
| Live adapter | `tom-live.js` — remove dual-sync crutches where safe |
| Open/destroy | `window.js` |
| DnD / structure | `drag-drop.js`, structure apply |
| Session/Apply | `session-api.js` — Apply snapshot Forest-ahead (C7.5 done) |
| Restore/H1 | `session-layout-restore.js`, `monitor-recovery.js` — Forest-first when peeling |
| Tests | CommandHandler, drag-drop, structure, nest invoke, tom-live |

## Ordered approach (suggested)

Explore inventory (2026-08-29) — use as peel order; re-grep only if stale:

1. **C7.1 Finder shim (start here):** `findNodeWindow(meta)` / `tree.findNode(meta)` → `hostBag.idFromMeta` → `liveById` → fallback `getNodeByValue` only if unseeded. Retarget hot Meta lookups in `window.js` / `command.js` / `drag-drop.js`. Spine `wsN`/`mo*` string ids stay separate. Brake: proto 154 + window/command/drag-drop vitest.
2. **Writers:** RunSteps `_moveOp`/bind/order + Apply structure + open/track + DnD SurfaceOps → Forest atomics + `paintLiveForest`.
3. **Drop interim** `syncForestFromTree` before Apply snapshot — **done** (C7.5).
4. **Gut** `tree.move` / `swapPairs` live SoT — **done** (C7.6). Host
   bodies remain as id-miss fallback + tests. Keep Node chrome /
   `createNode` / `setLayout` field paint as needed.
5. **Forest-first restore/H1** (ex-C6.5 spill) last among these — **next**.
6. **Brake:** proto 154; vitest tom/command/drag-drop/structure; nest Mark 2 smoke when units green.

**Top GObject-ahead writers today:** restore/H1 (`session-layout-restore.js`,
H1 `restoreTreeIfNeeded`), workspace/monitor spine. RunSteps / open / DnD /
command swap peeled Forest-first (C7.2–C7.6).

## Forbidden

- Revive hybrid project→mutate→apply-back as architecture
- FLOAT under MONITOR / ROOT-park floats
- Merge `resolveTargetMonitor` and `resolveStrictMonitor`
- Mutter/DOM in kernel; WebView↔Gnome key overlay imports
- pinned-slots / resize-autotile / ding / D069
- Edit `AGENTS.md` by hand
- Commit/push unless asked

## Acceptance

- [ ] GObject Node/Tree no longer authority for tiling topology
- [x] Finders via host bag / Forest ids (C7.1; DnD pointer C7.6)
- [x] RunSteps/open/DnD/command-swap mutate Forest then paint (C7.2–C7.6)
- [x] sync-before-snapshot interim removed (Apply); `forestForWrite` still aligns (C7.7)
- [x] Proto 154 + retargeted vitest green; nest smoke when practical
- [ ] Plan + HANDOFF + PRIORITY mark C7 done / cutover acceptance updated
  (C7.7 still open)

## Report

Paths/symbols changed, proven vs failed, tests, residue check, any DESIGN-FLAW stop.
