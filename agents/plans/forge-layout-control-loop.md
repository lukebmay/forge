# Plan: Layout control loop (open = batch N, settle + verify)

**Status:** ready — user locked direction 2026-08-05  
**Priority:** P0 reliability (open/tile desync; Ghostty; shared by layout CLI)  
**Branch:** `plan/forge-layout-control-loop` (create from up-to-date master after Wayland smoke gate, or stack on wayland-live if still open)  
**Created:** 2026-08-05  
**Host:** black — dual 4K; **X11 and Wayland** (protocol-agnostic control loop)  
**Supersedes implement path of:** [forge-layout-settle-pure.md](./forge-layout-settle-pure.md) (D0 discussion → this plan)  
**Related:** LF1–LF6 layout reliability, W-storm, place-hint / PlaceNext, monitor-recovery (legacy soft-rehome)

### Session note (overwrite)

**2026-08-05 (CL0+CL1 done, B AGREE):** On `plan/forge-layout-control-loop`.

- CL0: requestLayout/requestVerify debounce + post-render hook.
- CL1: `layout-verify.js` + agreement ≥2 SETTLED, agreement-confirm, mismatch latch,
  `markUnsettled`. Tests + docs green.
- **Next:** CL2 external geometry → unsettled + suppress attribution
  (`forge-layout-control-loop_cl2-external-geometry.md`).

---

## Origin of soft-rehome (fact)

| Question | Answer |
| --- | --- |
| jcrussell / forge-ext? | **No** — not in `forge_original` as a named subsystem |
| This fork? | **Yes** — Luke, commit `a897516` (2026-07-23): *feat(tiling): soft-rehome windows after workareas thrash (H1)* |
| Later | Extracted to `lib/extension/soft-rehome.js` (audit CA5); lock+DPMS harden |

Rename → **monitor-recovery** is a **separate PR** only: [forge-monitor-recovery-rename.md](./forge-monitor-recovery-rename.md).  
Do **not** mix renames into control-loop commits.

---

## Problem

1. **Open path ≠ batch path** — generic open uses short fixed delay (50/200ms) then
   `renderTree`; layout CLI uses open-all → fingerprint stable → residual (LF6).
   Drift causes bugs (e.g. sole Ghostty: full **tree slot** border, small **Meta frame**).
2. **No closed loop** — we command `move_resize_frame` but do not systematically
   **verify** Meta still matches the slot, or require **quiet** before first place.
3. **Sensors fire for our own apply** — without catalog + suppress discipline, we
   thrash or ignore real client thrash (Ghostty post-map **resize**, not move).
4. **Tree mutations and renders** are easy to conflate — many call sites request
   full apply; no single “request layout → debounce → commit → verify” API.

Ghostty note (corrected): on Linux it **resizes** after map to configured size;
it does not own absolute position under Wayland. Treat as **size thrash after map**.

---

## Goals

1. **One open pipeline** for N≥1 (dock/launcher N=1, `forge layout` N many).
2. **Debounced layout commit** — never render once per app in a multi-open batch.
3. **Event-driven settle + verify** — size/position/mon signals mark **unsettled**;
   quiet + Meta↔slot agreement mark **settled** (not wall-clock alone).
4. **App thrash catalog** — first-seen class heuristics; known thrashers get extra
   verify before/after commit.
5. **Track response to our apply** (first launches) for predictability.
6. **Clear terminology** for in-memory tree vs commit vs rebuild.
7. Works on **X11 and Wayland** without a session-backend split in this plan.

## Non-goals

- Renaming soft-rehome symbols (separate plan).
- Session backend split (`session/{wayland,x11}`) — later, after stable.
- Full god-file rewrite of `window.js` in one PR — introduce control API incrementally.
- Continuous 5s production rescan (debug optional only).
- Hardcoding only Ghostty forever without catalog/defaults escape hatch.

---

## Terminology (locked)

### Layout verbs (use these in code comments + new APIs)

| Term | Means | Does it touch Meta? |
| --- | --- | --- |
| **Mutate tree** | Change in-memory topology: attach, detach, parent, layout type, percent, mode | **No** |
| **Compute slots** | Walk tree → set `renderRect` / shares from workarea + percents | **No** |
| **Commit / apply** | For each TILE leaf, `move()` → `move_resize_frame` to slot | **Yes** |
| **Render** (`renderTree`) | Current pipeline: prune → processFloats → compute + apply + chrome | **Yes** (apply) |
| **Request layout** | Signal that a debounced render may be needed (`requestLayout(reason)`) | Not yet |
| **Verify** | Read Meta frames/mons; compare to tree slots/homes; no topology invent | Read Meta |
| **Correct** | On verify fail: re-apply slots and/or small replan, then request layout | Yes if re-apply |
| **Rebuild** (`reloadTree`) | Wipe workspace/monitor nodes, re-track flat (topology loss unless snapshot restore) | Yes |
| **Monitor-recovery** | Workareas thrash → last-good mon homes + T6 forest (legacy soft-rehome) | Yes |
| **Session restore** | Disk `session-layout.json` after HUP | Yes |

**Rule of thumb:**  
- *Tree* = model. *Render* = model → screen. *Verify* = screen → check model.  
- *Rebuild* is nuclear. *Mutate* without *render* is incomplete for TILE.

### Slot vs Meta frame

| | Tree slot | Meta frame |
| --- | --- | --- |
| Source | `node.renderRect` / `node.rect` | `metaWindow.get_frame_rect()` |
| TILE borders | Prefer **slot** | Lagging frames mis-size rings |
| Agreement | `frame ≈ slot` within ε (default 4px) + mon match | |

### Sensors vs actuators

| Layer | Examples | Role |
| --- | --- | --- |
| **Sensors (bind)** | `window-created`, `size-changed`, `position-changed`, `notify::wm-class`, `notify::title`, `window-entered-monitor`, `workareas-changed` | Observe; mark unsettled; request layout/verify |
| **Actuators (command)** | `move_resize_frame`, `move_to_monitor`, raise/focus | Enforce plan |

Our own apply **re-fires sensors** → must attribute “Forge-caused” vs “external/client” (suppress flag + optional post-apply window).

---

## Architecture

### Control loop (single writer intent)

```text
  sensors / commands / DBus / layout CLI
              │
              ▼
     requestLayout(reason)     requestVerify(reason)
              │                         │
              └──────────┬──────────────┘
                         ▼
              LayoutController (API on WM first; extract later OK)
                         │
         debounce 150–300ms (layout) / event-driven verify debounce
                         │
                         ▼
         mutate tree (plan) → renderTree once → scheduleVerify
                         │
                         ▼
         verify Meta ↔ slots (ε, mon)
           match ×2 consecutive  → SETTLED
           mismatch              → correct + requestLayout; reset agreement
                         │
         any size/pos/mon (external) → UNSETTLED; agreement=0; debounced verify
```

**Open = batch of N roles (N=1 for single app):**

```text
admit all (window-created → provisional node + sensors)
  → wait identity + client quiet (per window; catalog may extend)
  → one plan (attach / mon / shares / residual)
  → one debounced render
  → verify ×2 agreement
  → SETTLED
```

Layout CLI must call the same stages; LF6 fingerprint wait becomes the **batch quiet** gate, not a separate philosophy.

### Who may mutate the tree

| Allowed | Role |
| --- | --- |
| LayoutController / WM layout path | Topology + mode changes that feed render |
| Pure planners | Return **intents** only (no live tree writes) |

| Not allowed (target) | Instead |
| --- | --- |
| Random modules calling `tree.render` / deep reparent | `requestLayout` / controller APIs |

Incremental: first land `requestLayout` + verify + open batch; tighten write sites over tasks (not one big bang).

---

## App thrash catalog

### Purpose

When a class shows **unorthodox post-map geometry** (extra size-changed after
identity, frame diverges after our apply, mon bounce), record heuristics so
later opens of that class always get **extra verify** (and optional min quiet).

### What to record (in-memory + optional debug persist)

Per `wm_class` (and optional stem):

| Field | Meaning |
| --- | --- |
| `seenOpens` | Count of first-map observations |
| `postMapSizeChanges` | Size-changed count in first T seconds after map (excluding Forge-suppressed window) |
| `postApplyDrift` | Times frame left slot after our apply within U ms |
| `thrashScore` | Derived; above threshold → `needsExtraVerify` |
| `minQuietMs` | Learned or default floor |
| `builtIn` | From small default table (e.g. ghostty) |

### Built-in defaults (v1)

| Class / stem | Default |
| --- | --- |
| `com.mitchellh.ghostty` / `ghostty` | `needsExtraVerify`, minQuiet ~150–300ms after last **non-Forge** size-changed; first-open observation longer |

Defaults seed catalog; live observation can raise thrashScore, not silently lower below built-in without evidence.

### First launch of a class (session or ever)

- Longer observation window before first TILE **commit** (collect signals).
- Still **event-driven**: quiet + identity, with a **max wait** cap so broken clients do not block forever.
- After first good settle, subsequent opens use catalog (shorter path + extra verify if thrashy).

### Persistence

| Phase | Storage |
| --- | --- |
| v1 | In-memory for session + built-in table in code |
| v2 optional | `~/.config/forge/config/window-heuristics.json` (debug export; not required for acceptance) |

---

## Settle and verify rules

### Unsettled

Mark window (and forest if any TILE member unsettled) when:

- `size-changed` / `position-changed` attributed **external** (not under `_suppressGeometrySignalRetile`)
- `window-entered-monitor` actually changes mon home
- User grab resize/move
- Verify mismatch

### Quiet

Window quiet when no external geometry signal for `quietMs` (default ~150–300ms;
catalog may raise). Identity: wm_class usable for policy (non-null for normal apps).

### Agreement (one verify pass)

For each managed TILE (alive, not fullscreen carve-outs):

- `monitor` matches tree home
- frame within ε of slot (same ε as move(), default 4)

Floats: mon/policy only as needed; do not force slot.

### Settled forest

- **≥2 consecutive** verify passes with full agreement
- Separated by ≥ `verifyDelayMs` (~300ms)
- No external geometry event between them (else agreement counter = 0)

### After render

Always `scheduleVerify` (not only thrashy apps). Thrashy apps: **mandatory**
extra verify pass even if first pass looked good (user request: double-check
before considering done).

### Debounce

| Channel | Policy |
| --- | --- |
| `requestLayout` | 150–300ms trailing debounce; coalesce reasons |
| `requestVerify` | Event-driven debounce (shorter OK, e.g. 100–200ms); not every signal immediate |
| Batch multi-open | **No** per-app render; only after admits+quiet or max-wait |

### Periodic rescan

| Mode | Default |
| --- | --- |
| Production | **Off** |
| Debug gsetting | Optional interval (e.g. 5s) `layout-verify-interval-ms` = 0 default |

---

## Response-to-command tracking

On first opens (and when thrashScore high):

1. Record slot we commanded and timestamp.
2. On following size/position (after suppress clears): compare frame to slot.
3. If client overwrites size within window → increment `postApplyDrift`, mark thrashy.
4. Do **not** treat Forge-suppressed signals as client thrash.

**Agree this is worth the data:** small per-window state, large reliability win;
no continuous polling required.

---

## Interaction with existing code

| Existing | Keep / change |
| --- | --- |
| W-storm suppress + in-slot chrome-only | **Keep** — base anti-loop |
| External drift → retile | Route through **requestLayout/verify**, not naked immediate storm |
| LF6 layout CLI fingerprint | Becomes batch quiet; residual still via same commit+verify |
| PlaceNext / dock sticky | Still admit-time mon plan |
| `createDelay` 50/200ms | Replace with quiet+catalog (+ max wait); dock may keep short min |
| monitor-recovery (soft-rehome) | Unchanged behavior this plan; rename separate |
| Borders from slot (TILE) | Keep |

### X11 vs Wayland

Same control loop. Differences stay in Meta quirks (ε, stacking, mon signals),
not in two open philosophies. **No session-backend split in this plan** — if
that refactor lands later, it consumes this API.

---

## Task queue

| ID | Task | Status | Notes |
| --- | --- | --- | --- |
| **CL0** | Glossary + `requestLayout` / `requestVerify` skeleton + debounce constants | **done** | layout-controller.js + tests; B AGREE |
| **CL1** | Verify scanner (Meta ↔ slots) + agreement counter + schedule after render | **done** | layout-verify.js; B AGREE |
| **CL2** | External geometry → unsettled; suppress attribution | **next** | task: `…_cl2-external-geometry.md` |
| **CL3** | App thrash catalog + built-in ghostty + first-open observation | pending | In-memory v1 |
| **CL4** | Open path = batch N=1 through controller (replace blind createDelay) | pending | Sole Ghostty live acceptance |
| **CL5** | Layout CLI / multi-open uses same commit+verify (LF6 quiet → one render) | pending | No per-app render mid-batch |
| **CL6** | Optional debug periodic verify gsetting + docs | pending | Default off |
| **CL7** | Live black: Ghostty sole open + `forge layout dev` + X11 or Wayland note | pending | Operator smoke |

### Suggested first implement task

`agents/tasks/forge-layout-control-loop_cl0-request-api.md` — CL0 only when branch cut.

---

## Acceptance (plan-level)

1. **Terminology** documented in plan + short `docs/dev/` or DESIGN note for verbs.
2. **Single open pipeline** for N=1 and N>1 (no intentional drift).
3. **Debounced layout** — multi-open does not `renderTree` once per launch.
4. **Verify ×2** before forest SETTLED after a layout commit that placed tiles.
5. **Ghostty sole open:** window frame ≈ full (or correct) slot; border matches window; no stuck full-ring / small-client desync under normal start.
6. **W-storm tests still green**; no title-spam full retile regression.
7. **X11 not regressed** — same code paths; smoke or unit where possible.
8. **No soft-rehome rename** in this plan’s commits.

---

## Testing strategy

| Layer | What |
| --- | --- |
| Unit | Debounce coalesce; agreement counter reset on unsettled; catalog thrashScore; verify pure compare ε |
| Regression | Simulated Ghostty: map small → size-changed large → quiet → one apply → drift → re-verify corrects |
| Live | Sole Ghostty mon0; second Ghostty; `forge layout dev`; journal: no render-per-open flood |

Instrument (debug install): optional timeline log map / size-changed / apply / verify for one class — strip or gate before merge if noisy.

---

## Efficiency

| Concern | Mitigation |
| --- | --- |
| Extra verifies | Debounced; O(tiled windows) frame reads — cheap vs Shell thrash |
| Catalog | O(1) per class map |
| No 5s default poll | Event-driven only |
| Apply feedback | Existing suppress + do not count as client thrash |

---

## Branch / merge

- Feature branch: `plan/forge-layout-control-loop`
- Prefer cut from **master** after Wayland border/storm operator gate; if wayland-live still needed, merge master→feature first.
- Do not auto-merge until CL4 live Ghostty + tests green.
- **Separate** PR for [monitor-recovery rename](./forge-monitor-recovery-rename.md).

---

## Open decisions (none blocking start)

| Item | Default if unset |
| --- | --- |
| Exact debounce ms | layout 200ms, verify 150ms, verifyDelay 300ms |
| First-open max wait | 2.5s then commit anyway + verify loop |
| Persist heuristics | v1 memory only |

---

## Handoff bullets (next agent)

1. Read this plan + [forge-monitor-recovery-rename.md](./forge-monitor-recovery-rename.md) (do not implement rename here).
2. Soft-rehome is **ours** (H1), not jcrussell.
3. Branch exists: `plan/forge-layout-control-loop` — implement **CL0 → CL1 → CL2 → CL3 → CL4**.
4. Ghostty: size thrash after map, not self-move.
5. Open = batch N=1; layout multi-open same loop.
6. Keep W-storm guards; route corrections through requestLayout/verify.
7. X11 included (same paths); no session-backend split in this plan.
8. After CL4: live sole Ghostty; update HANDOFF/PRIORITY.
9. **Git stash:** Wayland residual WIP is stashed for agents to manage — full note in [HANDOFF.md](../HANDOFF.md) (*Agent git: stashed Wayland WIP*). Do not drop; do not pop onto this branch.
