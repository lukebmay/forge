# Plan: Layout control loop (open = batch N, settle + verify)

**Status:** active — CL8+ deferred hidden open (after CL0–CL7 X11)  
**Priority:** P0 reliability (open/tile desync; Ghostty; shared by layout CLI)  
**Branch:** `plan/forge-layout-control-loop` (implement here; merge → master when CL8–CL10 green)  
**Created:** 2026-08-05  
**Host:** black — dual 4K; **X11 green** for CL0–CL7; Wayland residual **after** CL8–CL10  
**Supersedes implement path of:** [forge-layout-settle-pure.md](./forge-layout-settle-pure.md) (D0 discussion → this plan)  
**Related:** LF1–LF6 layout reliability, W-storm, place-hint / PlaceNext, monitor-recovery (legacy soft-rehome)

### Session note (overwrite)

**2026-08-05 (CL8 done — Task Force A):** Deferred hidden LayoutBatch admit shipped
on `plan/forge-layout-control-loop`.

- `lib/extension/layout-deferred-open.js` + vitest; wired in `window.js`
  (`trackWindow`, `endOpenLayoutBatch`, `disable`, processFloats, raise guards).
- Batch will-tile maps: FLOAT, mon sticky (`safeMoveToMonitor`), opacity 0, no
  percent carve / open commit / mid-batch aspect split; release on batch end +
  disable.
- N=1 open path unchanged. Full `npm test` green (2113).
- Next: **CL9** layout CLI parallel open + wait-for-map + unhide gate before residual.

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

## Deferred hidden open (CL8+) — user lock 2026-08-05

### Problem (live)

`forge layout` opens are correct *eventually* (PlaceNext + residual) but the
path is jumpy: wrong monitor first, temporary H/V **slivers**, focus thrash,
then residual restructure. Tiny first frames can also upset apps.

### Locked direction (do not re-litigate without user)

| # | Decision |
| --- | --- |
| **Pipeline** | **Parallel** launch → map **hidden** → **do not** intermediate TILE/split geometry → batch quiet → **one** residual plan + admit + render + verify |
| **Tree** | Prefer **outside permanent tile geometry** while deferred (FLOAT / no percent carve / no mid-batch `renderTree`). Still **track** so GetTree + role pins work. |
| **Staging alternative (fallback only)** | If hide proves impossible for a class: last tile unit on mon → if TABBED join else wrap TABBED; **not** equal-split spam. Do **not** implement complex “largest unit / count visible splits” analysis. |
| **Mon sticky** | PlaceNext home mon → early `move_to_monitor` (same spirit as dock sticky). Relocate within mon later is OK. |
| **Focus suppress** | During LayoutBatch: **no raise/activate** of deferred maps; do not steal LFT for survivors. |
| **Residual focus** | Apply profile **saved focus** (layout IR `focus`), not “whatever last mapped.” |
| **Apply chrome (G)** | Optional **disablable** UI setting: soft mask/scrim while residual apply. **FIRM:** must **never** stick (hard timeout auto-clear + clear on batch end + clear on `disable()`). Stuck chrome = dealbreaker. |
| **Skip** | Client-side X11 position hints (H) — not worth it. |
| **Speed** | Parallel first; stability over mid-batch pretty tiles. One final tree render, not temporary-then-final. |
| **Wayland** | Operator Wayland residual **after** CL8–CL10 code + X11 retest. |

### Target flow

```text
LayoutBatch begin
  [optional chrome show — only if setting on; arm hard clear timer]
  parallel: PlaceNext(mon[+path]) + launch each missing role
  on map (batch): move_to_monitor(home); track FLOAT deferred;
                  hide actor; no insertChildPercent; no raise;
                  no open TILE commit / no mid-batch render
  wait: all roles mapped (id pin) + forest/client quiet
  residual: unhide deferred → freeze → plan ops (moves/tabs/sizes) →
            one render + verify → focus from profile
  LayoutBatch end + chrome clear (always)
```

### Non-goals this slice

- Full pre-build of every empty CON skeleton from sugar (nice later; not required).
- Serial open as default.
- Renaming soft-rehome.

---

## Task queue

| ID | Task | Status | Notes |
| --- | --- | --- | --- |
| **CL0** | Glossary + `requestLayout` / `requestVerify` skeleton + debounce constants | **done** | layout-controller.js + tests; B AGREE |
| **CL1** | Verify scanner (Meta ↔ slots) + agreement counter + schedule after render | **done** | layout-verify.js; B AGREE |
| **CL2** | External geometry → unsettled; suppress attribution | **done** | layout-sensors + suppress; B AGREE |
| **CL3** | App thrash catalog + built-in ghostty + first-open observation | **done** | app-thrash-catalog.js; B AGREE |
| **CL4** | Open path = batch N=1 through controller (replace blind createDelay) | **done** | layout-open.js; B AGREE |
| **CL5** | Layout CLI / multi-open uses same commit+verify (LF6 quiet → one render) | **done** | LayoutBatch + gate; B AGREE r2 |
| **CL6** | Optional debug periodic verify gsetting + docs | **done** | layout-verify-interval-ms default 0; B AGREE |
| **CL7** | Live black: Ghostty sole + `forge layout dev` — **X11 first**, Wayland after | **done (X11)** | X11 green 2026-08-05; Wayland residual open after merge · PWA `fe8448c` · [completed live](./forge-layout-control-loop/completed/forge-layout-control-loop_cl7-live-ghostty.md) |
| **CL8** | Deferred hidden admit during LayoutBatch (ext): mon sticky, hide, no split carve, no raise | **done** | [completed](./forge-layout-control-loop/completed/forge-layout-control-loop_cl8-deferred-hidden-open.md) · layout-deferred-open.js |
| **CL9** | Layout CLI: parallel open + wait-for-map (not TILE settle) + unhide gate before residual | **next** | after CL8 |
| **CL10** | Optional layout-apply chrome/scrim setting + hard auto-clear (never stuck) | **pending** | after CL9 |
| **CL11** | Live retest X11 `forge layout dev` (then Wayland residual) | **pending** | operator + agent HUP |

### Suggested next implement task

`agents/tasks/forge-layout-control-loop_cl9-…` (or create CL9 task) — parallel CLI open + wait-for-map + unhide gate.

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

1. **CL9 next** on `plan/forge-layout-control-loop` — parallel open + map wait + unhide gate.
2. Wayland residual **after** CL8–CL10 + X11 retest (do not block on Wayland).
3. Soft-rehome is **ours** (H1); rename separate PR.
4. Ghostty: size thrash after map; settle intentionally a bit slow — but **no** temporary slivers.
5. Layout multi-open: LayoutBatch + **hide until residual** (not mid-batch TILE).
6. Apply chrome must never stick (CL10).
7. **Git stash:** wayland-live WIP stashed — do not drop; do not pop onto this branch or master.
