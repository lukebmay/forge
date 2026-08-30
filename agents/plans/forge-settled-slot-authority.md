# forge-settled-slot-authority — Presenter SoT + Forge window model + evidence-only geometry

**Status:** Accepted (design meeting 2026-08-30) — **architecture lock**. Implementation is sliced below; do **not** delete heal waves until S3.
**Branch:** master
**Decision:** **D095**
**Blocker:** [`../blockers/settled-slot-authority-design.md`](../blockers/settled-slot-authority-design.md) (close only when implementation slices below say so)
**Updated:** 2026-08-30
**Related:** D069 (tab peer geometry — heal posture amended) · chrome D071 (epoch-leave force-heal note amended) · D026 (known drift restore) · D030 (zoom — behavior clarified here) · D092/D093 (Forest + AGREE) · R025 (reveal verify)

---

## Agent read-this-first (FIRM — do not improvise)

| Rule | Meaning |
| --- | --- |
| **Presenter = reality** | Meta/Mutter (Gnome) or the host renderer (WebView) is the source of truth for **what is actually on screen**, when that presenter can be queried. |
| **Forge always owns a window model** | Not optional. Not “only if Meta is slow.” Per managed window, Forge stores **projected**, **commanded**, and **observed** geometry (presenter-specific), plus heal decision trail when heals exist. |
| **No blanket reassert** | Never `move_resize` / reassert “just in case.” Writes only with **evidence** (observed disagree after desired recompute, or an explicit data-driven heal phase). |
| **No geometry `force: true`** | Do **not** bypass the ε / in-slot check with a sledgehammer. Failed ε → **fallback heal phases** that still use data. Existing `force: true` on move/reassert paths are **debt to remove**, not a pattern to copy. (`commitLayout({ force })` = render knob, unrelated.) |
| **ε is measured, then locked, then may forgive** | Baseline from nest `smoke-geom-epsilon` (`ceil(worst_settle_dMax × 1.2)`). Progressive forgiveness is **later** (S6) + fault-inject required. |
| **Progressive bump scope** | **Per wm-class** (session-learned). Not per-window-only. |
| **Untestable ⇒ remove or make testable** | Fallbacks / zoom reasserts / heal waves that cannot be fault-injected under a named `--dev=` mode are dead code. |
| **Primary path first** | `strict-geometry` / nest smokes run **without** fallbacks. Fix the primary present; do not paper over with reasserts. |
| **Nest logs are separate** | Nest campaigns query **nest** `forge.log` / `forge.jsonl` via `nest_log_query` / `FORGE_CONFIG_HOME` sibling — **never** the host tape. |
| **No host-singleton launches from nest** | Never launch Chrome / Nautilus / Inkscape from nest campaigns — they attach to the host desk. Nest-safe = ghostty (`--gtk-single-instance=false`). Always close nest TILE windows on campaign exit. |

If a change violates a row above, **stop** — it is out of scope for this plan.

---

## Problem

Forge repeatedly reasserts Meta geometry without evidence. That is thrash and a performance drain. Heal waves and `force: true` hide primary-path bugs. ε=4px was a historical Chrome fudge, not a measured product lock.

---

## Locked architecture (D095)

### L1 — Two layers, one job each

```text
Forge window model (always)          Presenter (Meta / WebView / …)
  projected desired AABB      ←→       observe actual frame (when queryable)
  commanded move/resize                apply command
  observed result + deltas             (WebView: if unqueryable, model must
  heal decision trail                   be accurate enough that paint is trust)
```

- **Desired** comes from presenter paint math (`paintRectForWindow` / `paneRect` / zoom paint). Structure changes (e.g. tab bar height) **recompute desired**, then **compare** to observed, then write only if disagree.
- The window model is **presenter-specific** (Meta bags ≠ DOM layout bags). Shared *shape*: projected / commanded / observed / trail.
- Host bag (`lib/host`) is the Gnome home for Meta-volatile geometry facts — **not** TOM nodes (D083/D092).

### L2 — Epsilon (acceptance threshold)

| Fact | Lock |
| --- | --- |
| **Meaning** | Max allowed \|sent−observed\| on each of x/y/width/height (pixels for Meta). |
| **Baseline formula** | `ε₀ = max(4, ceil(worst_settle_in_band_dMax × 1.2))`. Samples: nest `post-write-settle` only; exclude `min-known`; treat `dMax > 64` as **outlier** (layout/async), not jitter. |
| **Baseline value (locked)** | **`ε₀ = 4` px** (Meta/Gnome). Nest campaign 2026-08-30: ghostty settle in-band worst **0**; floor 4 keeps historical Chrome 1–4px margin until a **host-safe** multi-app campaign revises. Do not use immediate-phase dMax (thousands of px async noise). |
| **Presenter-specific** | Meta ε ≠ WebView ε. Gnome Meta uses the nest-measured baseline. |
| **Too tight** | Heal/fallback always fires → primary path useless. |
| **Too loose** | Visible jitter left uncorrected. |
| **Measurement** | `geom-epsilon` logs (S1) + `forge-test nested smoke-geom-epsilon`. |

#### Progressive forgiveness (S6 — after `ε₀` applied in code)

Applies **only** when the window is **reasonably close** to current ε (near-miss), **not** when far away, and **not** when the miss is explained by **known window minimums**.

```text
1. Primary present sends move/resize to desired.
2. Observe presenter frame after settle.
3. If within ε → done (record sample).
4. If outside ε:
   a. Known min overflow for this app → mins / overflow path (NOT ε bump).
   b. Far miss → data-driven heal phases (NOT ε bump).
   c. Near miss → may retry with an **adjusted** command (same target policy,
      not identical useless repeat). After 2–3 failures still near-miss →
      **increase ε for that wm-class** (forgive) and record why.
5. Identical command with identical expected outcome must not loop forever.
```

**Differentiate mins vs jitter when mins unknown:** prefer signals already in mins learning (`noteWindowMinFromClamp`, oversized frame vs slot, hints). If still ambiguous, log `geom-epsilon` `tag=ambiguous` and **do not** bump ε on that sample.

**Bump scope (FIRM):** **per wm-class** (session-learned). Per-window override only when class samples are thin.

**Fault-inject (required before production forgiveness):** `--dev=fault-inject-geometry` lies about sent/observed near-miss so bump is asserted. No harness ⇒ no production forgiveness. Production fallbacks return only when that harness is green.

### L3 — Evidence-only writes (no geometry force)

| Situation | Action |
| --- | --- |
| Desired unchanged + observed within ε | **Skip write** |
| Desired changed (structure, percent, workarea, zoom paint, …) | Recompute → compare → write **only if** disagree |
| Observed disagree (idle external snap, etc.) | One corrective write (D026-style) or enter heal phases |
| ε check failed | Enter **fallback heal phases** (data-backed). **Never** `force: true` to skip the check |

**Geometry-force is forbidden** on `move` / `reassertNodeToSlot` / `reassertAllTabStackSlots` / sibling reassert. Demote/delete existing call sites in later slices. Slot-machine hard retries become **explicit heal phases with logged evidence**, not ε-bypass.

### L4 — One primary present; heals only with evidence

- Primary path: TOM + world → paint rect → `Tree.apply` / presenter move.
- Secondary waves (post-render heal, epoch-end reassert, join force reassert, zoom reassert) are **fallback / debt**.
- **Visible-first** (open leaf before buried peers in a TABBED/STACKED group) must live on **primary present** before those waves are removed (today it only lives in `reassertAllTabStackSlots`).
- Tab bar / chrome size change ⇒ desired changed ⇒ evidence to **check**, not to blind-resize.

### L5 — Reveal / select verify (tab click **and** keybind)

Any path that raises/selects a window in a TAB/STACK (tab strip click **or** keybind focus/selection):

1. Raise / focus first (not size-first).
2. Verify observed vs desired.
3. Correct **only if** outside ε.
4. **WARN** (`forge log`) so a miss on the primary path is investigable.

Standing all-peer reassert on focus remains forbidden (PWA thrash).

### L6 — Zoom (amends D030 practice; zoom reassert = heal)

| Rule | Lock |
| --- | --- |
| Zoom reassert (`_reassertZoomedTiles` force path) | **Off until testable.** Prefer fix primary zoom paint. Treat as heal debt. |
| Chrome | Forge chrome must **not** overlay a zoomed window; zoomed window is raised above chrome. |
| Unzoom | Restore to the pre-zoom slot/placement. |
| TABBED | Zoom paints **that window** only — **do not** change the TAB group slot size for peers. |
| Cardinality | **At most one zoomed window per monitor.** Zooming another on that monitor unzooms the previous. (`applyOneZoomPerMonitor` already encodes one-per-mon.) |

### L7 — Run modes (not binary prod/dev)

Install / update accept composable modes on **`--dev=`** (comma-separated):

```bash
./install --dev=strict-geometry,geom-epsilon-measure
./install --dev=fault-inject-geometry
./install --dev   # legacy alias: TRACE + production=false (no extra modes)
```

| Mode | Purpose |
| --- | --- |
| `strict-geometry` | Fallbacks / opportunistic heals **off**; primary path only |
| `geom-epsilon-measure` | Ensure sent/observed `geom-epsilon` logging is on |
| `fault-inject-geometry` | Intentional near/far ε lies to test heal + progressive forgiveness |
| `geom-trace` | Full projected/commanded/observed trail verbosity |

Env vars are **not** required for v1; add later only if needed. Fallbacks may return to production **only** after a named mode can exercise them and tests pass.

### L8 — Nest testing + separate logs (FIRM)

| Rule | Detail |
| --- | --- |
| **Every D095 slice** | Add / extend a **nest** smoke or campaign that exercises the new behavior (and can opt into `--dev=` modes). |
| **Nest tape** | `~/.local/state/forge/nested/<name>/forge.log` + `.jsonl` (sibling of `FORGE_CONFIG_HOME`). Query with `nest_log_query` / `forge log` under nest `env`. |
| **Never** | Scrape host `~/.local/state/forge/forge.log` for nest campaigns; never launch host-singleton apps from nest. |
| **Cleanup** | Campaigns must close nest TILE windows they opened before exit. |
| **Entry** | `forge-test nested smoke-geom-epsilon` (S1); further smokes named per slice. |

### L9 — Amend D069 / D071 heal posture

**Keep:** shared tab/stack content rect; visible-first; raise-first reveal; no afterFocus all-peer reassert.
**Retire as default:** “heal until sure” / blind epoch-end / join geometry-force.
**Pointer-amend** CHANGELOG rows (do not silently rewrite history).

---

## Finish-before-redesign

| Work | Stance |
| --- | --- |
| toggleTabStack nest / live-layout leftover | May continue **in parallel**; not blocked by D095 docs |
| Deleting heal waves / `force` sites | **Blocked** until: window-model fields + measurement campaign direction clear + visible-first on primary present |
| Progressive ε forgiveness | **Blocked** until starting ε locked from real samples + fault-inject harness |
| Pinned-slots / resize-autotile | Still parked (unchanged) |

---

## Implementation slices (ordered)

### S0 — Docs lock (this meeting)

- [x] Plan Accepted + D095 row + `design.md` geometry section
- [ ] Blocker stays open until S3+ (or explicit split) — docs alone do not close it

### S1 — Epsilon measurement (debug instrumentation) — **landed**

**Goal:** Real-world sent vs observed samples + nest campaign. **No** progressive forgiveness yet. **No** heal deletion.

- [x] `lib/extension/geom-epsilon.js` + unit tests
- [x] `_moveImpl` logs `geom-epsilon` (skip TRACE; write DEBUG immediate + settle)
- [x] `forge-test nested smoke-geom-epsilon` (ghostty-only; nest tape; closes nest tiles)
- [x] Baseline lock: **ε₀ = 4** (formula + nest result above)

**Out of scope for S1:** applying a different constant in product paths before S6 notes; removing `force`; demoting heals; progressive bump.

### Nest baseline campaign (2026-08-30)

| Field | Value |
| --- | --- |
| Entry | `./install --dev && forge-test nested smoke-geom-epsilon` |
| Clients | ghostty ×3 (Chrome/Nautilus/Inkscape **forbidden** — host singleton leak) |
| Settle samples | 28 (`agree` 27, one outlier 432) |
| In-band worst dMax | **0** |
| Recommended | `max(4, ceil(0×1.2))` → **4** |
| Nest tapes | `~/.local/state/forge/nested/forge/forge.{log,jsonl}` |

### S2 — Window model in host bag

Projected / commanded / observed (+ trail stubs) on `HostBagEntry`. Pre-move skip when desired unchanged **and** observed within ε. Settle observed on skip and on write.

### S3 — Primary present visible-first

Move open-leaf-before-buried into `Tree.apply` (or present move-list owner). Nest smoke. **Required before** demoting heal waves that currently provide visible-first.

### S4 — Run-mode plumbing

Composible `--dev` / install modes from L7. `strict-geometry` disables fallbacks. `fault-inject-geometry` scaffold (may no-op until S6).

### S5 — Demote / delete opportunistic heals

Gate or remove: second-wave `reassertAllTabStackSlots`, post-render heal, epoch-end geometry-force, CENTER join geometry-force. Replace verify give-up `force` with logged heal phases. Zoom reassert off / deleted until zoom has its own tests.

### S6 — Lock starting ε + progressive forgiveness

From S1 logs: pick starting ε → CHANGELOG lock → implement near-miss retry + ε bump with fault-inject tests. Production forgiveness only when harness green.

### S7 — Zoom product fixes (if still wrong after S5)

Chrome stacking, unzoom restore, TABBED leaf-only zoom — fix primary path; no reassert cover-up.

### S8 — Closeout

HANDOFF / PRIORITY / blocker done only when opportunistic blanket heals are gone (or explicitly wontfix with metrics) and S1→S2 direction is recorded.

---

## Do / do not

| Do | Do not |
| --- | --- |
| Log `geom-epsilon` and hunt with `forge log` | Scrape tape files with `cat`/`rg` |
| Skip write when evidence says in-slot | `force: true` geometry “just in case” |
| Recompute desired on structure/chrome change, then check | Blind resize all peers on tab join |
| WARN on reveal correct | Silent heal with no log |
| Fault-inject before trusting fallbacks | Ship untestable heal/zoom reassert |
| Keep mins overflows on mins path | Bump ε because an app cannot shrink |

---

## Open points (narrow — do not invent)

1. ~~**Progressive bump scope**~~ — **Locked: per wm-class.**
2. **“Reasonably close” band** — define in S6 from histograms (e.g. within max(2×ε, N px)).
3. ~~**Baseline ε**~~ — **Locked: ε₀ = 4** (formula + nest campaign). Host Chrome revisit may revise via new CHANGELOG row.
4. ~~**`--dev=` surface**~~ — **Locked: comma-separated modes on `./install --dev=`** (S4 implements).

---

## Context for the next agent

Operator meeting (2026-08-30) locked D095. Scratch design-skill draft under `/tmp` is **not** authoritative — **this plan + CHANGELOG D095 + `design.md`** are. First code = **S1 measurement only**.
