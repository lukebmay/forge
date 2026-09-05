# forge-mark2-user-ops-surface — OpSet owns every user gesture

**Status:** Accepted (operator lock 2026-09-02); **U3 done** — U4 optional
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-09-02

## Goal

**Hard line (no exceptions):** the active OpSet (Mark 2 today) fully
defines every operation a user can set in motion — keyboard, pointer,
commands, run-steps. Host **SurfaceOps** are internals the OpSet may
call; they are **not** a parallel user path.

**Pointer surface (same hard line, U0 locked):** OpSet user-facing
pointer API is abstract input — `hover` / `release` (world coord + grab
+ tagged hit) — **not** host commands named after zones
(`Mark2DropCenter`, …). Hover returns chrome/preview **descriptors**
only (no TOM write). Release returns `{ op, args }` into that OpSet’s
**named Ops** (`move` / `join` / `group` / …) or noop — the same verbs
as keybinds. Zone geometry and drop-chrome policy are **OpSet data**
(Mark 2: five-zone tile, CENTER = Group). Host captures grab/coords,
hit-tests, paints, presents.

```text
Host → OpSet.pointer.hover|release(ev)
     → OpSet policy (zones/chrome)
     → OpSet.ops.group|move|join|…
```

Normative product: [`mark2.md`](../../prototypes/container-motion/src/opsets/mark2.md)
**Ops** + **Pointer** (D101 expanded in place).

## Why

Dual paths (DnD → Mark2 *or* `resolveDropSurface`) become spaghetti.
Zone-named host commands (`DropCenter`) are the same dual path with
nicer names. Abstract pointer in + named TOM ops out keeps adapters thin
and lets another OpSet swap chrome/zones without a kernel change.

## Acceptance

- [x] **Design lock (Grok 4.6 U0):** D101 expanded; `mark2.md` Pointer +
      Ops (renamed from Mark 2 “SurfaceOps”); remaining slices retargeted
- [x] DnD / pointer commit maps through `OpSet.pointer` → named Mark 2 Ops
      (U2+U3); no live `resolveDropSurface`
- [x] Keyboard and pointer for the same intent share the same Mark 2 op
- [x] CENTER create/enter-tab uses Mark 2 `group` (U1 shipped; U2
      retargets through `OpSet.pointer`)
- [x] L0 related green after U2/U3
- [ ] Host: Nautilus below Ghostty CENTER groups on **first** try
  (`Kf7DR` failed — R059/D106; logout tip then retest)

## Implementation slices

| Slice | What | Status |
| --- | --- | --- |
| **U0** | Grok 4.6 design lock — D101 + `mark2.md` pointer/layer/glossary; this plan retargeted | **done** |
| **U1** | Mark 2 `group(dir)`; DnD CENTER → group (interim; U2 retargets to `OpSet.pointer`) | done (pre-lock) |
| **U2** | `OpSet.pointer` + map remaining DnD onto named Mark 2 Ops; move five-zone policy out of Gnome | **done** |
| **U3** | Delete live `resolveDropSurface` from `_commitResolvedDrop` (assert-unreachable); run-steps / session-api emit same op ids | **done** |
| **U4** | Proto cases + nest smoke for Group / pointer; REGRESSIONS if host flakes | optional |

## Mark 2 `group(dir)` (product — U0 locked)

Invent or enter a **TAB/STACK** toward `dir` (pointer CENTER / foreign
strip; optional keyboard).

1. Sibling WINDOW under H/V → wrap/flip as **TABBED** (not split invent).
2. Sibling TABBED/STACKED CON → **always enter-con** at near edge
   (never promote-join flatten).
3. Else fail closed (do not silently Join).

Pointer `args.onto` may name the WINDOW or TAB/STACK CON. Off-monitor
`onto` → `transferLeafToMonitor` then steps 1–2. Join keeps today’s
promote-join for cross-axis **split** CONs. Group is the tab-intent
word.

## Layer table (locked)

| Layer | Owns | Must not own |
| --- | --- | --- |
| Kernel | Pointer event *shape* + tagged hit payload; `paneRect` math | Zone names (`center`); Mutter/DOM; grab lifecycle |
| Mark 2 | Zone/chrome policy; `pointer.hover`→descriptor; `pointer.release`→`{op,args}`; named **Ops** | St actors; `_commitDropSurface` as user path |
| Host adapter | Grab, coords, hit query, paint preview, present/observe | Tiling policy; `resolveDropSurface` fallthrough; `Mark2Drop*` |

## U2 — `OpSet.pointer` (next)

Implement the lock in [`mark2.md` Pointer](../../prototypes/container-motion/src/opsets/mark2.md).
Zero new user verbs. No `Mark2Drop*`. No Forest←GObject dual-write. No
grow `live-handle.js`.

**Steps:**

1. Add `MARK2_OPSET.pointer = { hover(ev), release(ev) }` in
   `lib/opsets/mark2.js` (event shape + contracts in `mark2.md`).
2. Move five-zone geometry + zone→op policy **out of** Gnome
   `drop-intent.js` / `_buildDropOperation` / `drop-zones.js` policy
   into Mark 2 pointer (host may keep a paint helper that consumes
   descriptor rects).
3. Preview path (`moveWindowToPointer(..., preview=true)`) →
   `pointer.hover` → paint descriptor. Commit → `pointer.release` →
   `ops[op]`. Same for synthetic session-api / run-steps (they
   synthesize `ev`, not zone-named commands).
4. Map remaining hits through pointer, not private mutators as the
   user path:
   - tile `window` five-zone (CENTER=`group`; in-axis adjacent edge=`move`;
     other edges=`join`)
   - `empty-monitor` → `move` with `onto`=MONITOR
   - origin strip reorder → `move` with `onto`
   - foreign strip → `group` with `onto`=CON
   - cross-mon = `onto` off-monitor (transfer then the same op)
5. CENTER is always Group. `dnd-center-layout=SWAP` is not a live
   mapping (do not keep CENTER→`swapPairs`).
6. Optional `args.onto` on `move` / `join` / `group` as locked — keyboard
   omits it. Do not add new Ops.
7. L0 / proto tests for hover (no TOM write) + release mappings. Nest
   `dnd-drop --zone` may remain as a **harness** that places `world` in
   that zone of the onto pane, then calls `pointer.release`.

**U2 done when:** live tile/empty-mon/strip/cross-mon preview+commit go
through `OpSet.pointer`; `_buildDropOperation` is not the policy owner;
no `Mark2Drop*`; related unit green. `resolveDropSurface` may still be
reachable until U3.

## U3 — delete live `resolveDropSurface`

**Steps:**

1. `_commitResolvedDrop` must not call `resolveDropSurface` on the live
   user path (assert-unreachable or delete the call).
2. `_commitDropSurface` / catalog names (`swapPairs`, `slotSplit`,
   `split`, `wrap`, `insert`, host `group` merge) are not reachable from
   pointer, keybind, commands, or run-steps. Keep a helper only if a
   test asserts it is unreachable, then delete.
3. Run-steps / session-api emit the same op ids as `pointer.release`
   (or the `{op,args}` result). Empty-mon is `move`, not
   `_commitEmptyMonitorDrop` as a parallel user path.
4. `resolveDropMark2` (zone→op via `_buildDropOperation`) dies with the
   old policy owner — pointer owns that map.

**U3 done when:** grep of the live commit path has no `resolveDropSurface`;
synthetic + pointer share named Ops; related unit green.

## Context for the next agent

- **Next:** host borders + blocker
  (host PASS — blocker archived). U4 optional (proto/nest smoke) — skip
  unless cheap. Do **not** start G8n while blocker open.
- Do **not** invent `Mark2Drop*`. Do **not** dual-write Forest←GObject.
  Do **not** grow `live-handle.js`.
- U3 deleted live `resolveDropSurface` / `_commitDropSurface` /
  `_buildDropOperation` / `resolveDropMark2`; session `_dndDropOp`
  synthesizes `ev` via `worldPointInMark2Zone` → `pointer.release` →
  `_commitPointerOp`. Empty-mon is `move` (host Meta last-resort only).

## Session note

2026-09-02 U3: Deleted `_commitResolvedDrop` SurfaceOp fallthrough,
`_commitDropSurface*`, `_buildDropOperation`, `resolveDropMark2`,
`resolveDropSurface`. Session/run-steps `_dndDropOp` → tagged `ev` +
`pointer.release` → `_commitPointerOp`. Empty-mon → `move` (+ host
`_commitEmptyMonitorDrop` last-resort). Related unit 84 pass; proto
ALL PASSED. Next = host borders/blocker (U4 optional).

2026-09-02 U2: `MARK2_OPSET.pointer = { hover, release }` in
`lib/opsets/mark2-pointer.js`. Five-zone + zone→op owned by Mark 2;
`drop-zones.js` is paint helper over Mark 2 geometry. Host
`moveWindowToPointer` builds tagged hits, paints from hover descriptors,
commits via `pointer.release` → `runMark2` with `onto`/`insertIndex`.
Optional `onto` on move/join/group. CENTER always Group (SWAP pref
ignored).

2026-09-02 U0 (Grok 4.6): expanded D101 in place (same meaning; no D102).
Renamed Mark 2 **SurfaceOps → Ops**. Locked event shape, hover/release,
layer table, Group vs Join, zone→op including empty-mon / strip /
cross-mon.
