# 10 — C4 / C5 FLOATS membership + reconcile fail-safe

**As of:** 2026-08-29
**Lock:** [D092](../../../design/CHANGELOG.md) · plan
[`forge-live-tom-cutover.md`](../../forge-live-tom-cutover.md)
**Depends:** **C3.6** (apply demoted to paint/reconcile; ROOT-park handoff)
**Prior:** [09-c3-live-forest-cut.md](./09-c3-live-forest-cut.md)
**Status:** **C4 done** · **C5 done** (`lib/extension/reconcile.js` + hooks).
Next cutover: **C6**.

---

### Scope

Opened:

- Cutover C4–C5; design.md D087/D092 FLOAT + reconcile
- `tom-live.js` `applyLiveForest` FLOATS→ROOT park (~451–459)
- `command.js` `floatToggle` → `wm.toggleFloatingMode`
- `forest-run.js` refuse float/minimized Mark 2 focus
- `open-min-place.js` split→tab→float (min-size policy seed)
- Mark 2 glossary: FLOATS bag; re-tile = Launch / Join into TILES
- Conflict table from explore/09

Did **not** implement. Did **not** edit `lib/`.

---

### Today vs target

| Concern | Today (post C3.2) | After C4+C5 |
| --- | --- | --- |
| FLOAT topology | Projected FLOATS bag; **apply parks** GObject kids on **ROOT** | Live Forest **FLOATS** membership is SoT |
| Host cue | `Node.mode === FLOAT` / `isFloat()` | Same **until C7** — bridges paint/signals; does **not** own membership |
| Re-tile | Toggle mode + percent reset on GObject parent | **Launch** / **Join** into TILES (Mark 2 words) |
| Apply fail | Min-size heuristics / open-min float eject; no TOM loop | Paint/apply → detect reject → RuleSet adjust → retry → **FLOAT fail-safe** |
| Mark 2 on float | `runLiveForest` returns false if focus `isFloat()` | Still TILES-only (D087); float focus stays out of Move/Join |

**proven** park site: `applyLiveForest` after TILES `applyKids`:

```text
floatsOf(forest).childIds → liveById → rootLive.appendChild(liveFloat)
```

That is topology fiction on GObject (ROOT children pretending to be
unmanaged). C3.6 stops treat-as-SoT write-back; **C4** replaces the park
story with FLOATS membership + float paint.

---

### C4 — live FLOATS replaces ROOT parking

#### Membership law (FIRM)

1. A WINDOW is floating **iff** its `parentId` is the FLOATS bag
   (`floatsOf(forest)` / `isUnderFloats`).
2. FLOAT windows **must not** sit under MONITOR / CON / ROOT as TOM
   children (D087/D092). A float may span heads — mon-local parent is a
   lie.
3. Re-tile = place into **TILES** via **Launch** (empty / beside focus)
   or **Join** — not “flip mode and leave a ghost slot.”
4. Do **not** invent a second glossary. If a SurfaceOp name is needed,
   extend `mark2.md` + OpSet in the same effort.

#### GObject `mode` bridge (until C7)

Until GObject `Node`/`Tree` lose topology authority (C7):

| Layer | Owns |
| --- | --- |
| Forest FLOATS bag | Membership / SoT |
| `Node.mode = FLOAT` (or host bag flag) | Paint, raise/lower, exempt from tile `move_resize`, signal filters |
| `floatToggle` / open-as-float | **Must** move the WINDOW in Forest **and** set host mode |
| ROOT `appendChild` of floats | **Retired** as topology; actors may remain off-spine for paint only if needed — never re-read as tiling truth |

Interim dual-write is OK only as **paint cue**, not as a second tree.

#### Float create / destroy paths (hook same Forest writers as C3.5)

| Event | Forest | Host |
| --- | --- | --- |
| User float toggle on | Detach from TILES parent → append under FLOATS; RuleSet settle TILES | `mode=FLOAT`; skip tile slot paint |
| User float toggle off (re-tile) | Launch/Join into TILES (focus slot / LFT); leave FLOATS | `mode=TILE`; paint slot |
| Open starts floating | Insert under FLOATS (not MONITOR) | createNode/mode FLOAT as paint factory until C7 |
| Destroy | Remove from Forest (FLOATS or TILES) | bag delete; Meta teardown |

`forest-run` continues to refuse Mark 2 when focus is under FLOATS /
`isFloat` — Move/Join are TILES-only.

#### DnD / GRAB_TILE

- Projection already: FLOAT → FLOATS; GRAB_TILE → FLOATS unless
  `treatGrabTileAsTiles` (DnD commit).
- C4: live Forest mirrors that. Grab-in-progress may stay TILES for
  commit geometry; finished float lands in FLOATS.
- Do not ROOT-park grab leftovers.

---

### C5 — reconcile loop + FLOAT fail-safe

#### Loop (design D092)

```text
mutate TOM (OpSet / open / restore)
  → paint/apply slot to host (move_resize / CSS)
  → host OK? done
  → else detect constraint (min-size, apply failure, refused geom)
  → RuleSet / named policy adjusts TOM (split→tab, resize shares, …)
  → retry paint
  → if TILES placement still impossible → move WINDOW to FLOATS
     (fail-safe) + paint as float
```

FLOAT fail-safe **always terminates** the loop. FLOAT does not fight
TILES geometry.

#### Detect (adapter)

Reuse / retarget existing signals — do not invent a parallel min system:

| Signal | Today seed | C5 use |
| --- | --- | --- |
| Client min vs slot | `tree-layout.js` mins; `open-min-place.js` `slotOverflowsMins` | Pre-paint refuse + post-`move_resize` learn |
| Open cannot fit | `resolveOpenMinPlacement` → `{ kind: "float" }` | Same decision writes **Forest FLOATS**, not only mode |
| Mid-session overflow | `resolveTileOverflowPlacement` | RuleSet adjust then FLOAT fail-safe |
| Apply/paint hard fail | render/`move_resize_frame` throw or no-op + geom mismatch | Count as reject → adjust → retry |

Exact mismatch threshold stays adapter policy (Gnome); kernel only sees
“placement rejected” → adjust → FLOAT.

#### Adjust (RuleSet / policy)

Prefer **named** Mark 2 RuleSet / existing open-min policies:

1. Try tab-join into a legal unit (tab-only BFS).
2. Try share/percent redistribution that satisfies mins.
3. Else FLOAT fail-safe (membership move to FLOATS).

Do not bury new settle laws inside `window.js`. If a new SurfaceOp
appears, name it in `mark2.md`.

#### Retry bounds

- Cap retries (small constant, e.g. 2–3 adjust cycles) then FLOAT.
- Idempotent: already-under-FLOATS → paint float, stop.
- Never leave TOM claiming TILES while host painted float (or the reverse).

---

### What must wait for C3.6

**FIRM** (explore/09 + cutover): do not parallel-edit `tom-live.js` /
`forest-run.js` / WM forest ownership for C4–C5 until **C3.2 + C3.6**
land.

| Prerequisite | Why |
| --- | --- |
| **C3.6** demote apply to paint/reconcile | ROOT park is still topology write-back until apply is paint-only; C4 replaces the remainder |
| **C3.3** nanoid WINDOW + bag `liveById` | FLOATS membership keys must be durable Forest ids |
| **C3.5** Forest-first open/destroy | Float create/destroy must hook the same insert path |
| C3.4 focusIds | Nice-to-have before floatToggle sets `forest.focusId` |

**May prepare without touching those files:** unit tests against pure
Forest (append under FLOATS / Launch from FLOATS); policy tables in
explore; `open-min-place` unit extensions that return Forest ops.

**C6** may proceed in parallel only on Apply/epochs files that do not
change live apply-back semantics (`tree-query`, `layout-apply-*` read
path) — see explore/09 conflict rule.

---

### File ownership

| Step | Primary files | Notes |
| --- | --- | --- |
| C4.1 stop ROOT park in apply/paint | `lib/extension/tom-live.js` | Delete/replace park block; paint floats from FLOATS+bag |
| C4.2 Forest membership helpers | `lib/tom/` (existing `floatsOf` / append) + thin adapter helper | Prefer TomApi/atomics; no second tree API |
| C4.3 floatToggle → FLOATS / Launch | `lib/extension/command.js`, `window.js` (`toggleFloatingMode`) | Forest first; mode bridge second |
| C4.4 open/destroy float writers | `window.js` track/destroy; C3.5 helpers | Insert under FLOATS when floating |
| C4.5 Mark 2 / DnD float gates | `forest-run.js`, `drag-drop.js` | Refuse TILES ops on FLOATS focus; grab flags |
| C4.6 mode↔FLOATS sync (bridge) | `tree.js` mode; host bag optional `floating: true` | Until C7; bag may mirror |
| C5.1 reject detection | `tree-layout.js`, paint/apply path post-C3.6 | Adapter |
| C5.2 adjust + retry loop | new small reconcile helper under `lib/extension/` **or** beside paint; RuleSet in `lib/rulesets/` | Keep kernel free of Meta |
| C5.3 FLOAT fail-safe writer | same as C4.2/C4.3 | One membership path |
| C5.4 open-min / overflow → Forest | `open-min-place.js` callers in `window.js` / layout | Decision already ends in float — retarget writer |
| Tests | `tests/unit/extension/tom-live.test.js`, new reconcile unit, proto brake | Unit first |

Conflict hot files (C3 still owns until C3.6): `tom-live.js`,
`forest-run.js`, WM `forest` field in `window.js`.

---

### Test plan (unit first)

1. **Proto brake** — `cd prototypes/container-motion && npm test` (always).
2. **Forest membership (pure)** — WINDOW under FLOATS; Launch into TILES
   removes from FLOATS; settle leaves MONITOR max-1; no ROOT childIds for
   floats on the POJO.
3. **Paint contract** — apply/paint with FLOATS kids does **not**
   `appendChild` onto ROOT live; host bag still resolves Meta for float
   paint. (Retarget `tom-live.test.js` after C3.6.)
4. **Reconcile unit** — given slot < min → adjust path invoked → still
   impossible → node parentId = FLOATS; retry cap respected.
5. **open-min** — `{ kind: "float" }` maps to FLOATS membership helper
   (mock Forest), not only `mode=FLOAT`.
6. **Vitest CommandHandler** — floatToggle updates Forest FLOATS when
   live forest present (after C4.3).
7. **Nest smoke** (after unit green) — float toggle + Mark 2 refuse on
   float + forced min overflow → ends floating; no ROOT-park assertion
   in hunts.

---

### Anti-patterns

- ROOT-parking floats “because GObject needs a parent”
- Treating `mode=FLOAT` as topology SoT after C4
- Mark 2 Move/Join on FLOATS leaves
- Saying “float” for size leftover (`share`) — D090
- Starting C4 edits on `tom-live` / `forest-run` before C3.6
- Dual-run project→apply-back as the float architecture

---

### Do not rediscover

- D087/D092: FLOATS bag live; no MONITOR parent; FLOAT = reconcile fail-safe
- Re-tile = Launch / Join (`mark2.md`)
- C3.6 hands off ROOT-park remainder to C4
- C7 deletes GObject topology authority (mode bridge dies then)
- Product Move **is** Mark 2 Move; float toggle is membership, not Move
