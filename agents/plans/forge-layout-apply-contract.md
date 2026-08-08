# Plan: Layout apply / settle contract (v2 design)

**Status:** **locked** — implement on `plan/forge-layout-apply-contract`  
**Priority:** P0 (next engine work after Meta baseline)  
**Created:** 2026-08-07  
**Updated:** 2026-08-07  
**Branch:** `plan/forge-layout-apply-contract`  
**Base evidence:** Meta probe black/Wayland — multi-op thrash-free at **D=0** with Forge off  
([`tests/meta-probe/SESSION_HANDOFF.md`](../../tests/meta-probe/SESSION_HANDOFF.md))  
**Supersedes (direction):** pixel-lock settle + forest reassert in
[forge-layout-control-loop.md](./forge-layout-control-loop.md)  
**Related:** [forge-layout-settle-pure.md](./forge-layout-settle-pure.md),
[forge-settle-learning.md](./forge-settle-learning.md)

**Live smoke:** deferred while host is **Wayland** (no Shell HUP). Unit tests only
until operator can re-smoke on X11 or after logout.

### Session note (overwrite)

**2026-08-07 (AC4 done):** A/B **AGREE**. isolateThrashWindow + placeholder leaf +
remove reflow. Next: **AC5** slot-math tests.

---

## 1. Problem (one paragraph)

Forge plans a tree of slots, then fights Meta and clients for **pixel equality**
while treating its own apply echoes as external geometry and **re-laying out the
forest**. Meta alone places core apps without multi-op thrash. The bug is the
**apply/settle contract**, not Mutter.

---

## 2. Goals

1. **Parallel by default** — open all needed apps at once; step time ≈ slowest app, not sum.
2. **Tree owns plan** — mon, topology, shares, tab order. Slots from workarea + percents, **not** from other windows’ live Meta frames.
3. **Early apply** — move a window as soon as it is **admissible** (mapped + identity for role), without waiting for the whole batch to hard-settle.
4. **Hard settle only when Meta feeds the next op** — if the next step uses internal tree math only, do not block on Meta hard-stable.
5. **Bulletproof internal calculations** — wrong slots look like thrash; geometry math is a correctness P0, not polish.
6. **Echo-first attribution** — during a Forge layout wave, geometry jitter is assumed to be **our command + client response**, not a human, unless proven otherwise.
7. **No forest thrash** — one bad window never re-applies / unsets the whole tree.
8. **Bounded failure** — thrash budget exhausted → float thrash app + **placeholder tile** in the reserved slot (user can close placeholder to drop the empty slot).
9. **Residual nudge** — **deferred** until renders are stable; then decide if one-shot center is worth it.

## 3. Non-goals (this design)

- More Meta-off thrash scoreboards.
- Competing-tiler coexistence during layout waves (rivals stay disabled).
- Perfect pixel match to slot forever.
- Continuous production rescan.
- Post-apply center/nudge in v1 of this contract (explicit punt).

---

## 4. Evidence we keep

| Finding | Implication |
| --- | --- |
| Meta multi-op **D=0** thrash-free (ghostty, inkscape, obs, …) | Do **not** invent large inter-op sleeps for Meta |
| OBS open quiet ~4s class; others ~3s class (probe policy) | Cap observation windows; do not use as glue between every move |
| Ghostty cell-grid / post-map **size** snap is real | Residual is size; accept delta in v1 — do not reassert forever |
| LF6 whole-tree fingerprint → correct but jumpy | Global barrier was for **correctness races**, not because Meta needs it; replace with better phase rules |
| Sync `_suppressGeometrySignalRetile` only covers call stack | Need **wave/command epoch**, not a bool on the stack |

---

## 5. Core model

### 5.0 Hard settle vs internal math (locked lean)

| Next operation uses… | Need Meta hard-stable first? |
| --- | --- |
| Tree topology, percents, workarea → slots | **No** |
| Sibling placement from **other windows’ Meta frames** | **Yes** (avoid this path) |
| Role claim / mon from live Meta only | Prefer plan + spawn pins; Meta only if plan incomplete |
| Post-apply residual observe | Local only, not forest hard settle |

**Rule:** Hard settling is a **dependency gate**, not a lifestyle. If internal
calculations are the sole input to the next op, skip hard settle.

**Corollary:** Slot/workarea/gap/percent math must be **bulletproof**. A bad
`renderRect` produces endless “thrash” that is really **wrong plan**. Treat
geometry pure functions as high-test, high-review surfaces (unit tests for mon
workareas, gaps, nested splits, tab chrome insets, buffer-scale align).

### 5.1 Ownership

| Owner | Owns |
| --- | --- |
| **Tree** | Topology, percents, modes, mon homes, tab order, **intended** slot rects |
| **Meta** | What is on screen after commit |
| **Client** | Legal residuals (cell grid, min size, scale snap) within policy |
| **Controller** | When to launch, admit, apply, observe, stop; thrash isolation |

**Settled (window)** ≠ `frame == slot` forever.  
**Settled (window)** ≈ we commanded once (echo epoch done or abandoned), and we will **not** re-fight.

**Settled (wave)** ≈ every managed role is settled, placeholder-filled, or failed-open.

### 5.2 Phases (parallel-friendly)

```text
                    ┌─────────────────────────────────────┐
                    │ 0. PLAN (pure)                      │
                    │    profile → intents (roles, mons,  │
                    │    shares, tabs). No Meta writes.   │
                    └─────────────────┬───────────────────┘
                                      │
                    ┌─────────────────▼───────────────────┐
                    │ 1. LAUNCH (parallel)                │
                    │    spawn all missing apps at once   │
                    │    T_launch ≈ max(map_i), not sum   │
                    └─────────────────┬───────────────────┘
                                      │
              per window as ready (no global Meta-settle barrier)
                                      │
                    ┌─────────────────▼───────────────────┐
                    │ 2. ADMIT + APPLY (streaming)        │
                    │    identity + role pin → attach     │
                    │    compute slot from TREE           │
                    │    one commit to slot (move_resize) │
                    │    start per-window residual clock  │
                    └─────────────────┬───────────────────┘
                                      │
                    ┌─────────────────▼───────────────────┐
                    │ 3. RESIDUAL (per window, parallel)  │
                    │    echo observe; accept residual    │
                    │    (nudge punted v1) → SETTLED      │
                    │    thrash/fail → PLACEHOLDER        │
                    └─────────────────┬───────────────────┘
                                      │
                    ┌─────────────────▼───────────────────┐
                    │ 4. WAVE END                         │
                    │    chrome / focus open leaf         │
                    │    placeholders already in slots    │
                    └─────────────────────────────────────┘
```

**Key:** Phase 2 does **not** wait for all apps to finish residual before starting
moves. As each window becomes admissible, it can be placed. Global wall time is
dominated by **slowest map + that window’s residual**, not by sequential chains.

### 5.3 What we wait for (and what we do not)

| Event | Wait? | Why |
| --- | --- | --- |
| Other apps’ Meta frames to position this app | **No** | Slots from tree + workarea |
| Whole forest hard-stable before first move | **No** | Causes LF6 jumpiness and false coupling |
| This window mapped + identity for role claim | **Yes** | Need correct mon/role attach |
| After **our** apply: short residual observe | **Yes (bounded)** | Client size snap / min-size |
| Pixel equality to slot forever | **No** | Terminal grid, min-size, scale |
| Human drag mid-wave | **Out of band** | See §7 input freeze |

### 5.4 Residual policy (post-apply) — v1

After command epoch *N* for window *W*:

1. Attribute geom signals to **echo / client response** for a short residual
   window (catalog optional; raise-only later).
2. **Do not reassert** to chase pixel equality.
3. **Do not nudge/center** in v1 — **punt** until stable renders exist; then
   measure how far clients sit from slots and decide if one-shot adjust is worth
   a setting.
4. Never: mismatch → forest `requestLayout` → everyone moves.

**Later (only if needed after visual QA):** optional one-shot residual adjust +
gsetting to disable for speed.

---

## 6. Parallelism — answers to the open questions

### 6.1 “Open all apps right away; settle = max, not sum”

**Yes. Default.**

- Already directionally true in `LayoutBatch` (begin → open all → …).
- Contract change: drop **global fingerprint quiet before any residual place** as
  the correctness crutch. Replace with:
  - parallel launch,
  - streaming admit/apply per window,
  - per-window residual,
  - wave end when all roles terminal.

**Correctness risks to re-check (not ignore):**

| Risk | Mitigation without global Meta barrier |
| --- | --- |
| Two Ghostty instances claim wrong mon | Role pins + PlaceNext / launch flags **at spawn**, not post-hoc Meta frame |
| App maps before mon ready | Admit only when target mon index known; queue apply |
| Order-dependent tab claim | Plan tab order in tree first; admit into **prebuilt** slots |

If a class still needs “all companions present” (rare), that is a **role-group
barrier** (e.g. both mon1 tabs), not “entire forest Meta-stable.”

### 6.2 “If we don’t use Meta to position others, why wait for all to settle before moving?”

**We should not.**

- Planning never needed sibling Meta frames.
- Waiting was a **historical race bandage** (LF5/LF6 mon fights), not physics.
- Move each window when **that** window is admissible; residual is local.

### 6.3 Optional centering after resize

**Punted for v1.** After stable renders, eyeball residuals; only then consider
one-shot adjust + setting. Never multi-round chase.

---

## 7. Attribution: jitter is ours (plus client)

### 7.1 Default assumption during a layout wave

While `LayoutWave` is active (batch open, RunSteps apply, explicit layout commit):

| Source | Prior |
| --- | --- |
| Human drag / interactive resize | **Very low** |
| Competing tiler | **Out of scope** (rivals disabled for product path) |
| Forge apply + app self-adjust | **Dominant** |

So: **echo-first**. Geometry during the wave is **command response**, not
`onExternalGeometry` → forest re-layout.

### 7.2 Implementation sketch (replace stack bool)

```text
waveId = beginWave()
  for each apply(W, slot):
    commandId = nextCommand(W)
    record expected: targetRect, t0
    move_resize(...)
    W.epoch = { waveId, commandId, until: t0 + residualMs, mode: "echo" }
  ...
endWave() when all terminal
```

Signals while `W.epoch.mode == "echo"`:

- count toward residual / catalog,
- **do not** `markUnsettled` forest,
- **do not** `requestLayout` forest,
- may update “accepted frame” for chrome.

After epoch ends without thrash → window SETTLED.

### 7.3 Hardening: freeze user/Mutter interactive moves during wave

Optional belt-and-suspenders so the assumption holds:

| Approach | Pros | Cons |
| --- | --- | --- |
| **A. Modal grab / inhibit** (shell modal or unreactive stage overlay — CL10 chrome already dims) | Blocks clicks; simple mental model | Heavier UX; a11y; must hard-timeout (CL10 ≤8s pattern) |
| **B. Ignore grab/size from user** while wave active (sensor policy) | No modal | Mouse may still move unmanaged windows if not grab-inhibited |
| **C. Mutter / keybinding inhibit** for move-resize during wave | Strong | API surface / version drift |
| **D. Rely on echo-first only** | Simplest | Rare human mid-layout edge |

**Recommendation (draft):**

1. **Always:** echo-first attribution during wave (§7.2).  
2. **Default on for multi-open / `forge layout`:** keep/extend **layout-apply chrome**
   (non-reactive dim) so clicks do not hit windows mid-wave.  
3. **Do not** block forever — hard cap like CL10.  
4. Single-window dock open: chrome optional/light; still echo-first.

Human intent mid-wave is rare; absorbing it is nicer than perfect detection.

---

## 8. Single-app thrash → isolate, never thrash the forest

### 8.1 Principle

> One thrashing window is a **local failure**. The forest stays planned and quiet.

Thrash definition (local): residual epoch exceeds budget (time / repeated size
fights / never admissible). **v1 does not count “frame ≠ slot after accept”
as thrash** — that is residual, not failure.

### 8.2 Isolation policy (locked lean)

```text
thrash(W) or role failed-open →
  stop reassert(W)
  float W (if still mapped) out of TILE control
  insert PLACEHOLDER tile in the reserved slot
  wave continues for everyone else
```

User removes the empty reservation by **closing the placeholder** (normal window
close / GNOME controls) → tree drops that leaf and **reflows** remaining siblings
(or tab group) once — intentional topology change, not thrash.

### 8.3 Placeholder tile (product)

**Problem:** A reserved empty slot with no remove affordance is a permanent hole.

**Clickable X on chrome:** works, but is a one-off control language.

**Preferred: real Forge placeholder window** (lean agreed):

| Aspect | Spec |
| --- | --- |
| Kind | Real Meta window owned by Forge (small GTK app **or** equivalent that gets normal shell frame/controls) |
| Role in tree | TILE leaf marked `placeholder` / known `wm_class` — never thrash-isolated, never re-opened by layout as a profile app |
| Content | Centered scaling text (tile-relative, not mon-relative): `Forge` / `Placeholder Tile` |
| Style | Same visual language as layout debug / model overlay (colors, weight), **size from tile `renderRect`**, not full monitor |
| Close | Standard window close → remove placeholder node → reflow siblings |
| Thrash app | Original thrashing app stays FLOAT (or unmapped); not forced into the slot |

```text
┌─────────────────────────────┐
│  [·][·][×]   title chrome   │  ← GNOME/CSD controls (close = drop slot)
│                             │
│           Forge             │  ← scale with min(tile.w, tile.h)
│      Placeholder Tile       │
│                             │
└─────────────────────────────┘
```

#### Why a real window (agree)

1. **Close is already a verb** users know — no custom X hit-target only Forge understands.  
2. **Consistent** with tiling: placeholder is just another TILE until dismissed.  
3. **Accessible** focus/keyboard close paths come with the toolkit.  
4. **Debug-friendly** — shows up in `forge tree` / Meta like any leaf.

#### Implementation notes (not blocking design lock)

| Approach | Pros | Cons |
| --- | --- | --- |
| **Tiny GTK helper** (`forge-placeholder` or similar) spawned into the slot | Real CSD/SSD, real close, Wayland/X11 normal | Process per hole (or one multi-window process); package/path |
| **St/Clutter actor** only (fake frame + fake ×) | No extra process | Custom chrome; not real GNOME controls; more Forge-only UX |
| **Hybrid** | St first for MVP, GTK later | Two UIs |

**Lean:** design for **real window + standard close**; if MVP needs speed, St
actor with explicit close that runs the same tree remove path is OK as a
stepping stone, but product north star is the Forge window.

**Must not:**

- Treat placeholder class as thrash / float-out loop.  
- Let `forge layout` “replace” placeholder with itself.  
- Leave orphan placeholders after successful role fill (swap placeholder → real
  app is a different path: failed-open vs thrash-after-map).

### 8.4 Failed-open vs thrash-after-map

| Case | Slot | Floated client |
| --- | --- | --- |
| Role never maps (timeout) | Placeholder only | — |
| Maps but thrash-isolated | Placeholder in slot | Client FLOAT (stop fighting) |
| Maps and settles | Real app TILE | — |

### 8.5 Why not reassert forever / forest layout

| Old behavior | New behavior |
| --- | --- |
| verify mismatch → reassert / requestLayout | accept residual; no forest fight |
| any external geom → forest unsettled | per-window epoch only |
| thrashy class → extra verify storm | thrash → placeholder + float client |

---

## 9. Relation to current control loop (CL*)

This is a **serious refactor of the contract**, not a greenfield rewrite of the
extension. Default stance: **delete or gut** old settle/apply policy unless a
line still has a clear job under §§5–8.

High-level:

| Keep (if still justified) | Kill / replace |
| --- | --- |
| Debounced `requestLayout` as single apply writer | Pixel-lock agreement ×2 → SETTLED |
| LayoutBatch begin/end + deferred open + apply chrome | Mismatch → reassert / `requestLayout` storm |
| Pure slot math (tree/processNode/gaps) — harden | `onExternalGeometry` → forest re-layout |
| Open admit + parallel launch | LF6 whole-tree fingerprint as default gate |
| Catalog **only if** used for open quiet / float-out | thrash-extra verify, SL1 time-to-slot-match |
| Diagnostic Meta↔slot scan (optional) | Success = frame ≈ slot forever |

Full inventory: **§15**.

---

## 10. Comparison: old vs new (short)

| | Old (effective) | New contract |
| --- | --- | --- |
| Open | Parallel launch, then often **global** quiet | Parallel launch + **streaming** place |
| Position source | Tree slots, but wait coupled via fingerprint | Tree slots only; no sibling Meta |
| After apply | Suppress call stack; late signals “external” | Command epoch = echo |
| Mismatch | Reassert / layout (up to N) | ≤1 adjust or accept or float-out |
| One bad app | Forest unsettled / layout storm | Float isolate; others finish |
| Meta baseline | Ignored (large delays, pixel war) | Near-zero inter-op; local residual only |

---

## 11. Decisions

| ID | Topic | Status | Decision |
| --- | --- | --- | --- |
| **O1** | Thrash isolate | **locked lean** | Placeholder tile in reserved slot; thrash client FLOAT |
| **O1b** | Remove empty slot | **locked lean** | Close placeholder (real Forge window preferred); then reflow |
| **O2** | Residual nudge | **punt v1** | No center/adjust until stable renders + visual QA |
| **O3** | Input freeze | **locked lean** | Echo-first + layout-apply chrome on multi-open |
| **O4** | Role-group barriers | **deferred** | Only if live multi-instance repro forces it |
| **O5** | Float vs IGNORE | **deferred** | FLOAT until ignore mode ships |
| **O6** | N=1 dock chrome | **deferred** | Light/none |
| **O7** | Hard settle | **locked lean** | Only when next op consumes Meta; else tree math only |
| **O8** | Slot math quality | **locked lean** | Bulletproof pure geometry — wrong math ≠ thrash |

---

## 12. Implementation tasks

| ID | Task | Status | Depends | Notes |
| --- | --- | --- | --- | --- |
| **AC1** | Purge §15 KILL verify/pixel-war paths + rewrite tests | **done** | — | completed/ |
| **AC2** | Command epoch attribution (replace stack-only suppress) | **done** | AC1 | completed/ |
| **AC3** | Streaming admit/apply; drop LF6 fingerprint default | **done** | AC2 | completed/ |
| **AC4** | Placeholder tile + thrash/fail isolate | **done** | AC2 | completed/ |
| **AC5** | Harden slot-math unit tests | **ready** | AC1 | |
| **AC6** | Live smoke | **deferred** | AC3–AC5 | Wayland — wait for X11 HUP or logout |
| **AC7** | Residual nudge (optional) | later | AC6 + visual QA | Punt v1 |

Active task files: `agents/tasks/forge-layout-apply-contract_ac*.md`  
Completed: `agents/plans/forge-layout-apply-contract/completed/`

---

## 13. What we are not doing now

- Forge-on thrash sweeps “to prove thrash.”  
- Residual center/nudge feature work (until AC7).  
- Dual systems (“new path + old reassert belt”).  
- Live install/HUP while on Wayland (AC6 deferred).

---

## 14. One-sentence contract

> **Plan with bulletproof tree math, launch in parallel, place each window as soon as it is admissible without Meta hard-settle unless the next op needs Meta, treat post-apply jitter as our echo and accept residuals (nudge later if needed), and if one app fails or thrashes, put a closable Forge placeholder in the slot and float the bad client — never thrash the forest.**

---

## 15. Purge inventory — old design residuals (design rule)

### 15.1 Refactor rule (locked lean)

| Rule | Meaning |
| --- | --- |
| **Not greenfield** | Do not rewrite WM/tree/decoration from zero. |
| **Serious purge** | Remove settle/apply/thrash **policy** that exists only for the old contract. |
| **Know or cut** | Keep a path only if we can state **what it does**, **why the new contract needs it**, and **who calls it**. |
| **No dual stack** | Do not leave “verify reassert storm” beside “echo accept.” One contract. |
| **Tests follow policy** | Tests that require mismatch→reassert / agreement×2 / thrash-extra are **obsolete** — delete or rewrite when implementing, not preserve. |

### 15.2 KILL (old contract — remove or gut on implement)

These encode **pixel war**, **forest thrash**, or **Meta hard-settle as lifestyle**:

| Residue | Where (today) | Why kill |
| --- | --- | --- |
| Verify mismatch → `reassertTilesByIds` / force reassert | `layout-controller.js` `_onVerifyMismatch` | Fights client residual; Meta baseline does not need this |
| Verify mismatch → `requestLayout("verify-mismatch")` | same | Forest re-apply storm |
| `LAYOUT_VERIFY_MISMATCH_MAX` + give-up force path | same | Cap on a war we should not fight |
| Agreement ×2 + auto `agreement-confirm` → SETTLED | same `_onVerifyAgreement` | SETTLED meant frame≈slot forever |
| thrash-extra verify after SETTLED | same + `THRASH_EXTRA_VERIFY_REASON` | Extra pixel check loop for thrashy classes |
| `onExternalGeometry` → `requestLayout` + `requestVerify` | `onExternalGeometry` | Treats echo/client snap as “replan forest” |
| SL1 time-to-stable via first Meta↔slot agreement | `_settlePending`, `noteOpenPendingForSettle`, `recordSettleSample` on agreement | Optimizes for old success metric |
| `needsExtraVerify` driving control-loop behavior | `app-thrash-catalog.js` + controller | Only served thrash-extra / extra verify |
| LF6 **whole GetTree fingerprint quiet** as default pre-place gate | layout CLI / open batch philosophy | Global Meta barrier; causes jumpiness; not required if tree owns slots |
| Residual **nudge/center** if any half-landed | (none / future) | Explicitly **punt** until stable renders |
| Stack-only `_suppressGeometrySignalRetile` **as sole** self-echo filter | `window.js` `move` / `tree.apply` | Incomplete; replace with command epoch (not “also keep both forever”) |

### 15.3 KEEP (clear job under new contract)

| Piece | Why we still need it |
| --- | --- |
| Tree + `processNode` / shares / gaps / tab insets | **Plan source** — must be bulletproof |
| `move()` / `move_resize_frame` apply | One-shot commit of slot intent |
| Debounced `requestLayout` → one `renderTree` | Single intentional apply writer |
| LayoutBatch begin/end | Parallel multi-open; no mid-batch render flood |
| Deferred open (CL8/CL9) | Hidden admit until release — still useful for batch UX |
| layout-apply chrome (CL10) | Input absorption during multi-open waves |
| Open admit: map + identity + role pin | Need window before place |
| Open quiet / max-wait **as admit gate only** | Optional short quiet before first place — **not** forest hard-settle; revisit numbers under new model |
| `safeMoveToMonitor` / monitor-recovery / session shield | **Different problem** (blank/wake, HUP) — not layout pixel-lock; keep until separately redesigned |
| Action pipeline / RunSteps / freezeRender | Batch structure ops; one Cf — keep, strip thrashy settle tails later |
| layout-verify **pure helpers** (`rectsAgree`, `scanForest`) | Optional **diagnostic** / debug overlay — not success loop |
| layout-debug-overlay | Human debug; independent |
| Placeholder product (§8) | New — not present yet |

### 15.4 REVIEW (keep only if re-justified at implement)

| Piece | Question to answer before keeping |
| --- | --- |
| `AppThrashCatalog` entirely | Open quiet floors only? Float-out thresholds? Or delete and use constants? |
| `minQuietMs` / Ghostty seed 250ms | Still useful as post-map admit delay, or redundant with streaming apply + echo epoch? |
| postMap / postApplyDrift counters | Diagnostic only, or drive float-out? If neither, cut. |
| Periodic verify interval (CL6) | Debug-only diagnostic OK; must not reassert |
| Tab/stack sibling `reassertNodeToSlot` in focus path | Needed for open-leaf chrome correctness, or another reassert war? Audit per call site. |
| `wait_for_tree_stable` / fingerprint in CLI | **AC3:** default off; `--wait-tree-stable` / env keeps helpers |
| Settle-learning plan (SL1/SL2) | Supersede or re-scope to residual/float-out metrics only |
| forge thrash dump CLI | Keep as **observe** tool; not as driver of reassert |

### 15.5 Tests (design stance)

When implementing, **do not** preserve behavior for:

- mismatch → N reasserts → give-up force  
- agreement 0→1→2 SETTLED  
- thrash-extra after SETTLED  
- `onExternalGeometry` schedules layout  

Those tests document the old disease. Replace with:

- apply once → echo signals do not `requestLayout`  
- verify mismatch does not move windows  
- parallel open / streaming place (as slices land)  
- thrash → placeholder + float (when that slice lands)

### 15.6 What “settled” means after purge

| Term | Old | New |
| --- | --- | --- |
| Window settled | frame ≈ slot ×2 | Commanded + residual epoch done (or abandoned) + **no more apply** |
| Forest/wave idle | all tiles pixel-agreed | All roles terminal: placed, placeholder, or failed-open |
| Verify | actuator (reassert) | **sensor** (optional log / debug) |

---

## 16. Design lock checklist

- [x] §§5–8 + §11 accepted (incl. placeholder + punt nudge)  
- [x] §15 kill list accepted (no “keep reassert as belt”)  
- [x] O4–O6 deferred  
- [x] Explicit: **no dual-path** old verify war  
- [x] Implement purge first (AC1), features second (AC2+)  

**Locked:** 2026-08-07 by operator Begin on this plan.  
