# forge-observe-agree-heal — After every act: wait, observe, heal ladder

**Status:** done — **H1–H6** (H0 locked)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-09-04
**Design:** D115 (amends D095 far-miss + D093 FLOAT terminator).
**Related:** [forge-vinyl-inkscape-investigatory.md](./forge-vinyl-inkscape-investigatory.md)
(Inkscape 700×651 is the named far-miss). D111 same-dest retry is **step 1**.

## Goal

After any tiling **act** (OpSet Move/Join/Group/Launch, layout present,
DnD commit), Forge **waits for Meta to settle**, then **compares** TOM
**desired** slot AABB to Meta **observed** frame. If they disagree
beyond ε, walk a **fixed heal ladder** until they agree. FLOAT is
agreement (the escape hatch), not a failed product.

This is the missing implementation of D095: ε exists **to detect
jitter and other misses so we can fix them** — not to give up.

## Why (context)

Apps **resize themselves** after we command a slot. Ghostty/terminals
snap to character-cell multiples. Inkscape (and others) snap to their
own min size. That self-resize is **jitter** relative to our commanded
dest. We command the TOM slot again. If Meta still will not honor the
slot, the dest is **under that app’s minimum**; remember the min and
**change topology** so a legal TILE slot exists, or FLOAT.

D095 forbids `force: true` (skip the check and shove). It does **not**
forbid commanding the slot again, recording mins, Group/Join, or FLOAT.

## Words

| Word | Who | What |
| --- | --- | --- |
| **Act** | OpSet / layout present / DnD release | One user or apply mutation that changed TOM or sent Meta geometry |
| **Wait** | Adapter | Settle-heuristics wait until Meta frame is quiet enough to **observe** — not a product `sleep(N)` forever, not skip-observe |
| **Desired** | TOM `paneRect` / `forestSlotPaintRect` | Slot we believe |
| **Observed** | Meta frame | What Mutter reports |
| **Agree** | Forge | TILE and \|desired−observed\| ≤ ε on the axes we commanded, **or** the window is FLOAT (escape hatch) |
| **Jitter** | App or compositor | Self-resize after our command (char-cell, min-size snap). First heal: command **the same desired** again |
| **App minimum** | Learned, per wm-class (and instance if needed) | Smallest frame Meta will keep after we asked for larger. Persist; use next time when computing dest / when deciding a TAB wrap is large enough |

## Heal ladder (FIRM — after wait+observe disagrees)

Walk **in order**. After **each** Mutter directive: wait, observe, stop
if Agree. Do not skip a rung. Do not `force: true`.

1. **Jitter correct** — command the same TOM desired dest again
   (`move_resize_frame` to `forestSlotPaintRect`). Bounded retries
   (D111). If now within ε → Agree.
1. **Learn minimum** — if observed stays **smaller** than desired on
   an axis, record that size as this class’s **app minimum** (do not
   treat the first map-size as min while we have not yet retried).
   Next presents for this class must not plan a TILE dest below that
   min.
1. **Join existing TAB** — on the **same monitor**, find the nearest
   TABBED neighbor whose **group slot** is ≥ the learned min. Group
   **enter** that bag (D108 child index still applies). Wait, observe.
1. **Create TAB** — if no such bag: pick the nearest **TILE neighbor**
   on that monitor such that wrapping the pair as TABBED would give a
   slot ≥ the learned min. Group wrap. Wait, observe.
1. **FLOAT** — if no neighbor works, FLOAT the window (D087/D093
   FLOATS bag). FLOAT **is** Agree.

Nearest = same MONITOR, then world neighbor query (D084). Do not hop
workspace. Do not steal a slot on another head.

**Visible wait (D105):** the user-facing “desk ready” still waits on
the **visible group**. The ladder may continue for that window; do not
block the whole desk on another monitor.

## Acceptance

- [x] After OpSet/present/DnD: one wait+observe; Agree or enter the
      ladder. Hunt tokens for each rung
- [x] Jitter: Ghostty-like self-resize then same-dest command → ε
      Agree without topology change
- [x] Min: far undersize after jitter retries → recorded min; next
      dest for that class respects it
- [x] TAB enter: existing bag on that mon with slot ≥ min → joiner
      in bag, Meta fills that slot (or continue ladder)
- [x] TAB create: wrap with nearest legal neighbor; both TILE in bag
- [x] FLOAT: no legal TILE slot → FLOATS; Meta unmanaged by TILE
      present. That is Agree
- [x] Nest: `leaf.layout.apply-inkscape-ws2` either TILE in-slot or
      honest TAB/FLOAT per ladder — not stuck 700×651 TILE in a full
      slot. `_forge-test-*` only. No `wm_class=Inkscape` product branch
- [x] Proto brake. No `Mark2Drop*`. No Forest←GObject dual-write

## Implementation slices

| Slice | What | Exit |
| --- | --- | --- |
| **H0** | This plan + D115 in `design.md` / CHANGELOG | Lock is readable |
| **H1** | After-act wait+observe hook (visible window). Unit: agree skip; disagree enters rung 1 | No silent skip |
| **H2** | Jitter same-dest retry (fold D111). Unit | Ghostty-class path |
| **H3** | Learn + persist app minimums; dest planner honors them | Min used next time |
| **H4** | Rungs 3–4 Group enter / wrap (Mark 2 Group; D108 index) | Topology heal |
| **H5** | Rung 5 FLOAT terminator | FLOAT = Agree |
| **H6** | Nest inkscape-ws2 + one jitter story | Nest stopped |

**Order:** H0 done → H1–H6 this session (one implementer).

## Do not

- Branch: **master**. No commit/push unless asked
- `force: true` geometry. Sleep-as-contract. `wm_class=Inkscape` branch
- Whole-forest `MON_MISMATCH` RESYNC. Map-time `move_to_monitor`
- Re-run unrelated green suites after each slice — only tests the
  slice can break (catalog testing § When to run)
- Host `forge layout vinyl`

## Session note

2026-09-04 — H1–H6 shipped on `master` (no commit). One owner:
`lib/extension/heal-ladder.js` (`observeHealAfterSettle` /
`decideHealStep`). Hook: `_scheduleGeomEpsilonObserve` else-branch
(D111 jitter is rung 1 via `geomUndersizeRetry`). Mins:
`noteWindowMinFromHealUndersize` after jitter; R062 skip stays until
then. Group: `runMark2` `group` + `place: "end"`. FLOAT:
`forestSetWindowFloating`. Topology rungs skip while ApplyEpoch live
(re-arm `healLadder:`).

**Proven:** unit `heal-ladder` 9, `geom-epsilon` 20, `WindowManager-tile-dest-undersize` 4, `drop-intent` 26, `open-min-place` 24, nest catalog pytest 56. Nest **PASS** `leaf.layout.apply-inkscape-ws2` (jitter×3 → learn-min 700×651 → FLOAT `no-legal-tile-slot`) and `leaf.settle.jitter-same-dest`. Nest stopped.

**Hunt:** `heal-ladder` `rung=jitter|learn-min|enter-tab|create-tab|float` (info); `rung=agree` debug. Keep `geom-epsilon phase=undersize-retry`.

Inkscape 700×651 TILE in a full slot is no longer the honest outcome.
