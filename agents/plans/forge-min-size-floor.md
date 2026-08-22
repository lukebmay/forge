# Plan: Min-size floor + passive learn (kill shrink-probe)

**Status:** **shipped (agent)** — M1–M5 agent done; soft human tiny-env open verify  
**Priority:** P0  
**Branch:** `master`  
**Created:** 2026-08-19  
**Decision:** **D049** (mins: env floor + passive clamp-learn; no shrink-probe)  
**Related:** open-min tab walk · DnD red zones · D026 TILE slot · D039 ApplyEpoch  
**Note:** D047 already used (split-chrome removal). This plan is **D049**.

---

## Problem

Wayland lacks reliable Mutter size hints. Forge compensated with **shrink-probe**
(`ensureWindowMinSizeKnown`: `move_resize` to 32×32, learn clamp, restore). That
races grabs, tiles, and Chrome (often ignores tiny resize) → forever-retry,
grab fights, stuck DnD, and a pile of cancel/queue/gave-up machinery.

Meanwhile free-open already has the healthy policy: **overflow → BFS same-mon
tab → float**. The probe was a bad *input* to that policy, not the policy.

## Locked product (do not re-litigate once approved)

| # | Lock |
| --- | --- |
| **L1** | **Always-on default floor** when env unset: **320×240** (`FORGE_MIN_TILE_WIDTH` / `FORGE_MIN_TILE_HEIGHT`). Env-only — no new gsettings. |
| **L2** | **Delete all shrink-probe product code** (queue/flush/cancel/abort/`ensureWindowMinSizeKnown` / `_forgeMinProbing*` / grab-end probe queue). No residual path may call tiny `move_resize` to discover mins. |
| **L3** | **Passive learn only:** when forge requests a TILE smaller than the client will accept, frame stays larger than request → raise known + class floor (`noteWindowMinFromClamp` / `window-mins.json`). Also learn when a tiled frame is **larger than its tree slot** after settle. |
| **L4** | **Placement policy (open + mid-session overflow):** illegal split/slot → BFS same-mon tab that fits → else float + **remove the vacated tile gap** (tree cleanup via existing Node/`cleanTree`/single-child join — no dead empty pane). |
| **L5** | **DnD** keeps per-zone red + refuse using `readWindowMinSize` (hints ∪ learned ∪ class ∪ **env floor**). Never fail-open for “unknown” once floor always applies. |
| **L6** | **ApplyEpoch / PlaceNext pins:** do not retarget pinned apply slots (same exclusion as today’s open-min). Mid-session rehome skips while `isApplyEpochLive()`. |
| **L7** | **Tiny-pane QoL** (`tiny-pane-tab-fallback-enabled` / `tiny-pane-min-edge`) stays a separate earlier-tab preference; do not merge into D049. |
| **L8** | Prove learn without probe: set env floors **tiny**, open Nautilus, confirm clamp-learn → class floor → red zones + BFS/float recover. |

```text
readWindowMinSize =
  Mutter hints (if any)
  ∪ per-window known (_forgeKnownMin*)
  ∪ class floor (window-mins.json)
  ∪ env default floor (320×240)

open / mid-slot overflow
  → resolveOpenMinPlacement (split | tab BFS | float)
  → on leave slot: remove gap (join/collapse empty H/V sibling hole)

DnD
  → dropWouldOverflowMins(floor) → red zones / refuse
```

---

## Delete inventory (probe must not affect product)

| Symbol / surface | File | Action |
| --- | --- | --- |
| `ensureWindowMinSizeKnown` | `window.js` | **DELETE** |
| `_queueMinSizeProbe` / `_flushMinSizeProbeQueue` | `window.js` | **DELETE** |
| `_cancelMinSizeProbes` / `_abortMinSizeProbe` | `window.js` | **DELETE** |
| `_minSizeProbeQueue` / `_minSizeProbeActive` | `window.js` | **DELETE** |
| `_forgeMinProbing` / `_forgeMinProbePending` / `_forgeMinProbeRestore` / `_forgeMinProbeGaveUp` | meta flags | **DELETE** all set/check sites |
| `move()` early-return on `_forgeMinProbing` | `window.js` | **DELETE** (gone with probe) |
| Grab-begin `_cancelMinSizeProbes` | `drag-drop.js` | **DELETE** call |
| Grab-end `_queueMinSizeProbe` / queue clear | `drag-drop.js` | **DELETE** |
| Probe unit tests (gave-up, cancel-on-grab, queue) | `WindowManager-drag-drop.test.js` etc. | **DELETE / rewrite** to floor+learn |
| Docs that prescribe probe / mid-drag rules | contracts · DESIGN · completed tasks prose | **REWRITE** to D049 |

**Keep (evolve):**

| Symbol | Role after D049 |
| --- | --- |
| `readWindowMinSize` | Merge hints + known + class + **env floor** |
| `noteWindowMinFromClamp` / `_scheduleMinClampLearn` | Passive learn only (no probe gate needed) |
| `rememberClassMin` / `window-mins.json` load/save | Durable class floors from learn |
| `dropWouldOverflowMins` / red zones | Consume floor (always defined) |
| `resolveOpenMinPlacement` / `bfsOpenMinTabCandidates` | Open + mid-session overflow |
| `addFloatOverride` | Last resort |

---

## Build slices (ordered)

### M0 — Decision + plan on disk (orchestrator / docs)

- Add **D049** row to `docs/DECISIONS.md`
- Persist plan at `agents/plans/forge-min-size-floor.md`
- Stub tasks under `agents/plans/forge-min-size-floor/`
- PRIORITY/HANDOFF point at plan

**Model:** **Grok 4.5** (mechanics) or same orchestrator.  
**Accept:** D049 text matches locks L1–L8; plan linked from PRIORITY.

### M1 — Env floor pure + `readWindowMinSize` (implement)

- New pure helper (prefer `lib/shared/` or `tree-layout.js`):  
  `defaultMinTileSize({ env, widthKey, heightKey })` → `{ width: 320, height: 240 }`  
  Env: `FORGE_MIN_TILE_WIDTH` / `FORGE_MIN_TILE_HEIGHT` (positive ints; invalid → default).
- `readWindowMinSize` always returns at least the env floor on each axis (after hints/learn/class merge — floor is the **minimum of last resort**, so `max(merged, floor)` per axis that is missing or below floor?  

  **Lock detail:** Floor is a **lower bound for policy**, not a claim about the app.  
  `effectiveMin = { w: max(hint/learn/class.w || 0, floor.w), h: max(... floor.h) }`  
  so tiny env (e.g. 1×1) still allows Nautilus learn to raise above floor for red zones.

- GJS reads via `GLib.getenv` (match `FORGE_CONFIG_HOME` pattern).
- Unit tests: unset → 320×240; env override; merge with class learn.

**Model:** **Grok 4.5**  
**Accept:** L0 pure + `readWindowMinSize` tests; no gsettings.

### M2 — Excise shrink-probe (implement)

- Delete delete-inventory symbols and all call sites.
- Remove probe-specific tests; keep/adjust cancel-on-grab tests → assert **no** probe APIs remain (`rg ensureWindowMinSizeKnown` empty in `lib/`).
- DnD grab path must not reference probe.

**Model:** **Grok 4.5** (serial after M1)  
**Accept:** `rg` clean for probe symbols under `lib/`; DnD + open-min L0 green; nest ping/clean ok.

### M3 — Mid-session oversized → learn → BFS → remove gap → float (implement)

**New named API** (extend contracts; do not twin):

- Pure: e.g. `slotOverflowsMins(slotRect, mins)` + reuse `resolveOpenMinPlacement` in `tab-only` or a sibling `resolveTileOverflowPlacement`.
- WM: e.g. `wm.rehomeIfSlotTooSmall(node)` called from post-`move` settle / size-changed **idle** path when:
  - TILE (not GRAB_TILE, not ApplyEpoch)
  - frame (or known min) **exceeds slot** on an axis by ε
  - learn mins first (`noteWindowMinFromClamp` / remember class)
  - then BFS tab on same mon; on success peel from old parent and **remove gap** (existing single-child H/V join / `cleanTree` / percent redistrib — **use Node child APIs only**)
  - else `addFloatOverride` + remove from tile tree + gap cleanup

**Coupling traps:**

- Must not fight D026 `_restoreTileToSlot` in a loop (rehome/float **or** restore — one owner).
- Skip during ApplyEpoch (L6).
- Debounce (SourceBag named slot per window) so size-changed storms do not thrash.

**Model:** **Grok 4.6 high** (tree ownership + D026 interaction)  
**Accept:** L0 for overflow rehome + gap gone; open-app-policy still green; no apply-epoch retarget.

### M4 — Docs + comments + contracts (implement)

Update (no probe language left as product):

| Doc | Change |
| --- | --- |
| `docs/DECISIONS.md` | D049 |
| `docs/DESIGN.md` | Free-open mins section → env floor + passive learn; delete probe paragraph |
| `docs/dev/contracts.md` | Rows for mins / open-min / DnD overflow — D049 APIs; forbid probe |
| `docs/user/troubleshooting.md` | If it mentions probe/learn, retarget to env + `window-mins.json` |
| Inline comments in `window.js` / `tree-layout.js` / `drag-drop.js` | Short *why* only; no probe novels |
| `agents/HANDOFF.md` + `PRIORITY.md` | Next = M* status; prove recipe with tiny env + Nautilus |

**Model:** **Grok 4.5** (after M2–M3 land)  
**Accept:** `rg 'ensureWindowMinSizeKnown|minProbe|_forgeMinProb' docs/ lib/` empty (except archive/completed historical tasks — optional footnote “superseded by D049”).

### M5 — Verify + host prove (orchestrator + human)

```bash
# L0 (representative)
npm test -- tests/unit/extension/open-min-place.test.js \
  tests/unit/extension/drop-intent.test.js \
  tests/unit/window/WindowManager-open-app-policy.test.js \
  tests/unit/window/WindowManager-drag-drop.test.js \
  # + new floor / overflow-rehome tests

./install --kit=vim
./scripts/forge/forge-test nested run --monitors=1 -- \
  bash -lc 'forge ping; env FORGE_JOB=0 forge layout _forge-test-clean'
./scripts/forge/forge-test nested status   # running: False

# Host (after logout for tip):
FORGE_MIN_TILE_WIDTH=1 FORGE_MIN_TILE_HEIGHT=1   # or tiny values
# restart Shell session / logout so env reaches gnome-shell
# open Nautilus onto a short pane → learn raises floor; red zones; BFS/float; no minProbe journal
```

**Models:** L0/nest **4.5**; optional review pass **4.6 med** on M3 diff only.  
**Human:** logout once; eyes-on tiny-env Nautilus recover.

---

## Model matrix (handoff)

| Slice | Model | Why |
| --- | --- | --- |
| M0 decision/plan disk | **4.5** | Doc mechanics |
| M1 env floor + readWindowMinSize | **4.5** | Pure + small wire |
| M2 delete probe | **4.5** | Excision; follow delete inventory |
| M3 mid-session rehome + gap | **4.6 high** | Tree + D026 + ApplyEpoch edge |
| M4 docs | **4.5** | Contracts/DESIGN/HANDOFF |
| M5 verify | **4.5** + human eyes-on | Nest/L0; host logout |
| Optional M3 review | **4.6 med** | Only if M3 large |

**Orchestrator:** top-level agent next session; **serial** M1→M2→M3→M4 (M1/M2 may batch in one 4.5 agent). Do not parallel M2+M3 (shared `window.js`).

---

## Out of scope

- Prefs UI / gsettings for default floor (env only)
- Changing tiny-pane defaults or merging with D049
- Cross-mon BFS (D044 mon-local)
- Retargeting ApplyLayout PlaceNext pins
- Reintroducing any shrink-probe “just for first learn”

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Env not visible to gnome-shell (user sets in terminal only) | Document: host env must be in session (systemd user env / logout); nest can inject via nest env |
| D026 restore fights rehome | Single owner in size-settle: overflow → rehome/float **instead of** restore-to-illegal-slot |
| Floor 320×240 tabs too aggressively on ultrawide halves | Floor is min for *policy*; half of 4K still ≫ 320; tiny-pane remains opt-in for earlier tabs |
| Passive learn still races | Keep existing delay/ε; no probe means no restore fight |

---

## Handoff prep (this session ends after approval)

**Next session start:**

1. Read `agents/HANDOFF.md` + this plan (once copied to `agents/plans/forge-min-size-floor.md`).
2. Confirm D049 approved (this exit_plan_mode accept).
3. Run M0 → M1 → M2 first (kill probe early so tip cannot re-arm hack).
4. Do **not** commit/push unless human asks.

**Prove recipe (acceptance narrative):**

> With `FORGE_MIN_TILE_WIDTH=1 FORGE_MIN_TILE_HEIGHT=1`, Nautilus open/split still recovers: mins learn from clamp-vs-slot (not 32×32 probe), red zones use learned size, overflow BFS/floats, vacated gap gone, journal has **zero** `minProbe` / `_forgeMinProbing`.

---

## Acceptance (whole plan)

- [x] D049 in DECISIONS; plan on disk under `agents/plans/` (M0)
- [x] No shrink-probe symbols in `lib/`
- [x] Env floor 320×240 + override works
- [x] Passive learn still raises class floors into `window-mins.json` (clamp + oversized-frame L0; host soft)
- [x] Open + mid-session overflow: BFS tab → float; gap removed
- [x] DnD red zones use effective mins (floor ∪ learn) (L0; host eyes-on soft)
- [x] Docs/contracts/DESIGN/HANDOFF updated (M4); L0 + nest green; host eyes-on with tiny env — **M5**

### Session note (overwrite)

**2026-08-22 residual oversized-frame learn done. No commit/push.** Soft human
blocker still open.

- **M1–M5:** as before (env floor + probe delete + overflow + docs + nest)
- **Residual:** `noteWindowMinFromOversizedFrame` when settled frame > slot;
  `_needsOverflowRehome` → same tab/float path —
  [completed](./forge-min-size-floor/completed/forge-min-learn-oversized-frame.md)
- **L0:** overflow-rehome + drop-intent + open-min + min-tile **81**; open-app +
  drag-drop **67**
- **Human:** [blocker](../blockers/d049-tiny-env-nautilus.md) (+ stack Nautilus
  eyes-on for oversized learn)
- **Next queue:** layout preflight · slot-id hard-fail · DnD preview


## Prior plans (mirrored; shipped)

| Plan | Role vs D049 |
| --- | --- |
| [forge-open-min-tab-walk-float](./forge-open-min-tab-walk-float.md) | BFS/float policy **keep** |
| [forge-dnd-minsize-gate-titlebar](./forge-dnd-minsize-gate-titlebar.md) | Red zones **keep**; probe **delete** |
| [forge-open-min-dnd-cold-wayland](./forge-open-min-dnd-cold-wayland.md) | Titlebar paint + persist **keep**; probe **delete** |

