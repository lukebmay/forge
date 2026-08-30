# 09 — C3 live Forest cut surface

**As of:** 2026-08-29
**Lock:** [D092](../../../design/CHANGELOG.md) · plan
[`forge-live-tom-cutover.md`](../../forge-live-tom-cutover.md)
**Depends:** C1 nanoid ∥ C2 host `Map<id, bag>`
**Prior audit:** [08-tom-sole-source-audit.md](./08-tom-sole-source-audit.md)
(hybrid dual-run — still true until C3 lands)
**Audience:** cutover implementers; parallel-agent split later

---

### Scope

Opened:

- Cutover plan C3 detail; HANDOFF / PRIORITY / D092
- `lib/extension/{forest-run,tom-live,command}.js`
- WM tree ownership sample in `window.js` (ctor + getter only)
- `lib/opsets/transact.js`
- Grep: `projectLiveForest` / `applyLiveForest` / `runMark2` /
  `createNode(` / `findNode` / GObject child-list writers
- Touch list for C4–C6 conflict (Apply / FLOAT / reconcile)

Did **not** dump `window.js` / `tree.js` / `session-api.js`. Did **not**
implement. Did **not** assume C1/C2 already merged.

---

### Current objects (as the code is)

| Name | File:symbol | Today |
| --- | --- | --- |
| **Live topology** | `window.js` `WindowManager._tree` | GObject `Tree` (= ROOT). Ctor `this._tree = new Tree(this)` (~222). Getter `get tree()` rebuilds if null (~1597–1601). Managers take `_tree`. |
| **Projection** | `tom-live.js` `projectLiveForest` | Walk GObject `childNodes` → ephemeral envelope Forest + `liveById`. WINDOW id = Meta `windowId`; CON = `n${seq}` per call. FLOAT/GRAB → projected FLOATS. |
| **Apply-back** | `tom-live.js` `applyLiveForest` | Writes layout/percent; `replaceChildren` for TILES; **parks FLOATS kids on ROOT** via `appendChild` (~321–329). Topology SoT remains GObject. |
| **Mark 2 runner** | `forest-run.js` `runLiveForest` / `runMark2` | `project → runOpAbstract → applyLiveForest → commitLayout`. Refuses float/minimized focus. |
| **Transact** | `opsets/transact.js` `runOpAbstract` | `cloneForest` → mutate draft → `applyForestSnapshot` onto the Forest passed in (today: the **projected** ephemeral one). |
| **CommandHandler** | `command.js` | Mark 2 TILES ops call `runMark2` / `runLiveForest`. Focus / float / leftovers still touch GObject `tree.*`. |
| **Host bag** | — | **Missing** until C2. Meta lives on `Node.nodeValue`. |

**proven** dual-run architecture comment at `forest-run.js:3–4`:
“project → mutate → apply-back → one commit.”

---

### Intended layer vs actual layer

| Layer (D092 / cutover) | Intended after C3 | Actual now |
| --- | --- | --- |
| Topology | One POJO Forest owned by adapter | GObject `Tree` |
| Mark 2 | Transact against that Forest | Transact against **projected copy** |
| Host facts | C2 `Map<id, bag>` | Meta/St on Node |
| Apply-back | Paint / reconcile from Forest+bag | `replaceChildren` write-back = topology |
| FLOATS | Live bag (C4) | Projection-only; apply parks on ROOT |
| Ids | C1 nanoid durable | Meta id / `nN` churn per project |

---

### Mark 2 path today (CommandHandler → forest-run)

```text
command({ name: "move.left"|… })
  → CommandHandler._handlers[…]
  → runMark2(wm, focusNodeWindow, op, dir, reason)
       └─ runLiveForest(wm, focusNodeWindow, mutate, reason)
            hooks: windowIdOf(Meta), createCon→new Node(CON, St.Bin),
                   workareasFromTree(wm.tree MONITOR nodes)
            projectLiveForest(wm.tree, hooks)   // ephemeral Forest
            runOpAbstract(forest, api, mutate)  // clone+commit on ephemeral
            applyLiveForest(forest, liveById)   // GObject children
            raise Meta; wm.commitLayout; settleTabFocus; movePointer
```

**proven** Callers of `runMark2` / `runLiveForest`:

- `command.js` — move/join/promote*/toggleTabStack/layout.cycle±/size.*
  (+ WindowMoveIn/Out, WindowMergeGroup, SwapNext/Prev → Mark 2)
- `drag-drop.js` `_commitDropMark2` — mapped DnD Join/Move with
  `treatGrabTileAsTiles: true`
- Unit: `tests/unit/extension/tom-live.test.js` (direct project/apply)

---

### What must change for C3

Goal (plan C3 + D092): **one Forest owned by the adapter**; Mark 2
transacts against it; `applyLiveForest` becomes **paint/reconcile** from
Forest + host bag — **not** topology write-back as SoT.

| Concern | Cut |
| --- | --- |
| Ownership | `wm.forest` (or adapter field) created at enable; destroyed/cleared on disable. Survive as sole topology across Mark 2 calls. |
| Runner | `runLiveForest` **stops** `projectLiveForest(wm.tree)`. Pass `wm.forest` into `runOpAbstract`. |
| Bridge | Interim: host bag (+ reverse Meta→id) builds paint `liveById` / actor map. Final C3: apply does not redefine child lists as truth. |
| Ids | Requires **C1**: projection’s `n${conSeq}` / Meta-as-WINDOW-id cannot be durable Forest ids. |
| Host peel | Requires **C2**: Meta/St leave nodes; bag keyed by nanoid. |
| Focus | `forest.focusId` / `selectionId`; host focus follows (raise/activate). |
| Structural Host events | Open / destroy / WS / monitor must **mutate Forest** (Launch/remove / envelope edits), not only `tree.createNode`. Can shim through createNode briefly, but Forest must lead. |
| Do **not** in C3 | Full FLOATS membership (C4); reconcile fail-safe loop (C5); Apply/epochs GetTree retirement (C6); delete `tree.js` (C7). |

**Anti-pattern (FIRM):** do not ship a steady-state hybrid that still
projects every chord then apply-backs as architecture. Bridge paint only.

---

### High-risk callers

Tag: **hot** = must retarget in C3; **adjacent** = breaks if Forest leads
but GObject still mutated alone; **later** = C4–C7 primary.

#### `projectLiveForest` / `applyLiveForest` / `liveById`

| Caller | Risk | Note |
| --- | --- | --- |
| `forest-run.js` `runLiveForest` | **hot** | Sole product project→apply path |
| `tests/unit/extension/tom-live.test.js` | **hot** | Retarget or become paint-contract tests |
| (none else import project/apply) | — | **proven** grep — only forest-run + that test |

#### `findNode` / `findNodeWindow` (Meta ↔ topology)

| Area | Risk | Note |
| --- | --- | --- |
| `window.js` (dozens) | **hot** | track/destroy/focus/LFT/open — Meta lookup |
| `command.js` | **hot** | focus helpers, swap last-active |
| `drag-drop.js` | **adjacent** | pointer → node; Mark 2 commit uses forest-run |
| `workspace.js` / `monitor.js` / `monitor-recovery.js` | **hot** | scaffold ids `wsN` / `moNwsW` |
| `session-layout.js` / `session-layout-restore.js` | **adjacent→C6** | restore still GObject |
| `tree.js` `findNode` | **later/C7** | `getNodeByValue`; CON has no durable id today |
| `tile-select.js` / `focus.js` / `decoration.js` | **adjacent** | Meta→node for chrome/focus |

#### `tree.createNode`

| Caller | Risk | Note |
| --- | --- | --- |
| `window.js` `trackWindow` (~3429) | **hot** | open path; often starts FLOAT |
| `workspace.js` | **hot** | WS node scaffold |
| `monitor.js` | **hot** | MONITOR per WS |
| `monitor-recovery.js` | **hot** | H1 survivor CON/MONITOR |
| `tree.js` definition | **later** | keep as paint/actor factory until C7 |

#### GObject child-list as topology

| Caller | Risk | Note |
| --- | --- | --- |
| `tom-live.js` `applyKids` / ROOT float park | **hot** | today’s apply-back SoT |
| `command.js` leftover focus/join helpers reading `childNodes` | **hot** | partner/dir pick before Mark 2 |
| `drop-intent.js` | **adjacent** | adjacency from `childNodes` |
| `session-api.js` `_moveOp` / tab reorder / RunSteps | **adjacent** | bypasses OpSet; dual writer |
| `tree.js` split/group/swap/move* | **adjacent→C7** | leftovers + DnD execute |
| `decoration.js` / render `tree.apply` | **adjacent→C5** | paint; must key by id |

---

### Proposed ordered substeps inside C3

Small enough to parallelize **after** the ownership spike. Each should
keep proto brake green; Vitest for touched surfaces.

1. **C3.1 — Own the Forest** — **done**  
   WM `forest` + `hostBag` + `liveById`. Ctor envelope; disable clears.
   **Bootstrap choice:** one-shot `projectLiveForest` (`seedLiveForest` /
   `ensureLiveForest`) after `trackCurrentWindows` + lazy Mark 2.
   **WINDOW ids = Meta windowId strings** this slice (nanoid = C3.3).

2. **C3.2 — Retarget `runLiveForest`** — **done**  
   Skip per-op `projectLiveForest`. `runOpAbstract(wm.forest, …)`.
   Interim `applyLiveForest` + `rebuildLiveById`. Tests: mutate live
   forest + apply.

3. **C3.3 — `liveById` from host bag** — **done**  
   Seed remaps WINDOW Meta-windowId → nanoid; bag `{ meta, windowId }`;
   invent-CON registers chrome; focus resolve bag-only.

4. **C3.4 — Focus / selection** — **done**  
   Runner sets `forest.focusId` / `selectionId`; host raise follows.
   Leave directional `tree.focus` as Host leftover until a later peel.

5. **C3.5 — Host structural writers → Forest-first** — **done**  
   Thin shims: `trackWindow` / destroy / WS add-remove / monitor
   create-recovery update Forest (atomics insert/remove) **then**
   paint. Helpers: `forestInsertWindow` / `forestRemoveWindow` /
   `forestEnsureSpineNode` / `syncForestFromTree` (preserve nanoids).
   C4 float membership hooks the same insert path.

6. **C3.6 — Demote apply to paint/reconcile** — **done**  
   `paintLiveForest` (alias `applyLiveForest`): layout/percent from
   Forest+bag; `replaceChildren` = paint mirror only; ROOT-park
   removed; FLOATS detach + `TODO(C4.1)`.

7. **C3.7 — Brake pack** — **done** (units)  
   `tom-live.test.js` + `CommandHandler.test.js` Mark 2; proto **154**.
   Nest smoke optional.

**Parallel later:** C3.4 can overlap C3.5 once C3.2–3 stable; C3.6 waits
on C3.5 for open/destroy. Do not start C3.6 while apply-back is still
the only way open nodes appear.

---

### Files that will conflict if C4 / C5 / C6 start early

Cutover says C4 ∥ C5 ∥ C6 **after** C3, “where files do not collide.”

| File | C3 | C4 FLOATS | C5 reconcile | C6 Apply-TOM |
| --- | --- | --- | --- | --- |
| `lib/extension/tom-live.js` | **own** | ROOT park / FLOATS membership | paint fail paths | — |
| `lib/extension/forest-run.js` | **own** | float refuse / treatGrab | commit/settle hooks | — |
| `lib/extension/command.js` | Mark 2 + focusId | `floatToggle` | — | — |
| `lib/extension/window.js` | forest field; track/destroy | FLOAT create/mode | render/commit | restore hooks |
| `lib/extension/tree.js` | createNode shim; findNode | `mode` FLOAT | `render`/`apply` | snapshot bridge |
| `lib/extension/drag-drop.js` | `_commitDropMark2` | grab float | — | — |
| `lib/extension/session-api.js` | dual `_moveOp` | — | — | **ApplyLayout / GetTree** |
| `lib/extension/layout-apply-*.js` | — | — | settle/retry | **desired = TOM** |
| `lib/extension/tree-query.js` | — | — | — | GetTree Surface only |
| `lib/extension/tree-snapshot.js` + `lib/epochs/` | id key prep | — | — | portable key = nanoid |
| `lib/extension/session-layout*.js` | findNode | — | — | restore against Forest |
| `lib/extension/workspace.js` / `monitor*.js` | Forest-first scaffold | — | workareas | — |

**FIRM conflict rule:** do not parallel-edit `tom-live.js` /
`forest-run.js` / WM forest ownership for C4–C6 until C3.2+C3.6 land
(or land behind feature flags owned by the C3 agent). C6 may read
`tree-query` / `layout-apply-*` earlier **only** if it does not change
`forest-run` / live apply-back semantics.

---

### Proven vs guess

| Claim | Tag |
| --- | --- |
| Only `forest-run` + `tom-live.test` call project/apply | **proven** (repo grep) |
| WM owns GObject Tree via `_tree` / `get tree()` | **proven** |
| Mark 2 CommandHandler + mapped DnD use `runMark2` | **proven** |
| `applyLiveForest` parks FLOATS on ROOT | **proven** (`tom-live.js` ~321–329) |
| `runOpAbstract` already clone+commits a Forest | **proven** |
| Bootstrap = one-shot project vs empty+fill | **guess** — implement choice |
| Exact WM field name `forest` vs adapter bag object | **guess** — match C2 module API |
| How much of `trackWindow` must move in C3.5 vs shim | **guess** — minimize; Forest must lead |

---

### Open questions

1. Bootstrap: seed Forest from existing GObject once at enable, or rebuild
   Forest only from Meta census + empty TILES spine?
2. During C3.2–C3.5 dual write: who wins if SessionApi `_moveOp` mutates
   GObject without Forest — refuse, mirror, or block RunSteps until C7?
3. Does `workareasFromTree` move to world bag geoms immediately in C3.1
   or stay GObject-derived until C5?

---

### Do not rediscover

- D092: POJO Forest is live SoT; big bang; no hybrid steady state.
- C1/C2 are prerequisites for durable ids + Meta peel.
- C4 owns live FLOATS; C5 reconcile+FLOAT fail-safe; C6 Apply desired=TOM;
  C7 deletes GObject topology authority.
- Product Move **is** Mark 2 Move; leftover `tree.move` is not the
  CommandHandler path (still exists).
