# forge-layout-visible-open — Hide-place-show, visible-first open, overlay on visible settle

**Status:** landed — **V0–V6**
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-09-04
**Design:** **D117** (amends D071 overlay lifetime, SM5 focus-after-all-hard,
D105 overlay execution). Does **not** invert D115 / D041 / D042 / D039.
**Related:** `project.md` § Layout apply architecture; slot machines
[forge-layout-slot-machines.md](./forge-layout-slot-machines.md);
visible settle D105.

## Goal

Layout apply (and ordinary TILE launch) must **feel like one placement**,
not map-then-fly. Opens **settle independently in parallel**. Spawn
order prefers what the user can see. Overlay and keyboard focus do
**not** wait on buried tab peers.

## Why (operator 2026-09-04)

Cold/partial `forge layout` still looks clunky: windows appear in the
wrong place, then jump; tab strips show the buried app first; the
apply overlay stays up while hidden tab members finish hard-ready
(D071 Done-clear). D105 already said user-wait is the **visible
group**; D071 later kept the overlay until forest-match Done. This
meeting **executes D105** for overlay and launch choreography.

## Words (do not mix)

| Word | Who | What |
| --- | --- | --- |
| **Mapped** | Meta | The app has a `Meta.Window` Forge admitted into the Forest slot. Not ε, not TILE-settled |
| **Visible TILE** | Apply | A WINDOW the user can see: a lone TILE on a monitor, **or** the **open leaf** of a TABBED/STACKED group (`lastTabFocus` / profile `active`) on the **active workspace** |
| **Buried TAB member** | Apply | A WINDOW in a TABBED/STACKED group that is **not** the open leaf |
| **Hide-place-show** | Adapter | Actor opacity 0 (or equivalent hide) from map until Forest dest is commanded; then show. One visual placement. **Not** minimize; **not** FLOAT as the hide |
| **Independent settle** | Adapter | Each WINDOW’s wait+observe+D115 ladder runs without blocking another WINDOW’s ladder |
| **Group has a window** | Apply | That TABBED/STACKED CON has ≥1 admitted WINDOW (mapped). Does **not** require buried peers |
| **Visible-hard** | Apply | Every **visible TILE** on the apply workspace is in-slot (D040) or honest FLOAT (D115 Agree) |
| **Overlay** | Apply chrome | Modal scrim. **D117:** hide at **visible-hard**. Buried may still settle |
| **Done.ok** | Apply | Unchanged D041: forest-match every **required** TILE slot. Overlay ≠ Done |

## Launch order (spawn, not settle)

Start **PlaceNext / spawn** in this order. Within a band, launches
**run in parallel** (independent settle). Do not wait for band N to
**settle** before starting band N+1 — only prefer **starting** earlier
bands first so maps tend to appear visible-first.

1. **Open leaves of TABBED/STACKED groups** on the apply workspace
   (profile `active` / `lastTabFocusId`).
1. **Other visible TILE** (monitor children that are WINDOW, not buried
   tab peers). Includes empty-head first TILE.
1. **Buried TAB/STACK members**.

**Chrome same-process serialize** (`chromeSerialWaitPins`) stays as a
**host constraint** when two Chrome/PWA opens would steal one process.
It is not the product order and must not reorder a Ghostty open leaf
behind a buried Chrome tab.

**Chaos shuffle** (`applyLayoutChaosCocktail` launch-order) is
**test-only**. Product apply must not shuffle away visible-first.

## Clock (one ApplyLayout)

```text
ApplyEpoch + overlay on
  → materialize skeleton + bind existing
  → spawn band 1, then 2, then 3 (parallel inside band; settles independent)
  → per WINDOW: hide → admit into slot (D042) → present dest → show
  → when a TAB/STACK group has ≥1 mapped WINDOW:
        raise + lastTabFocus the intended open leaf
        (do not wait for that leaf’s ε settle; do not wait for buried maps)
  → when every required WINDOW is mapped (admitted):
        profile keyboard focus once (pin still applies)
  → when visible-hard:
        drop overlay
  → buried peers finish in background (D105)
  → Done.ok = forest-match required slots (D041)
```

Slot machines remain the **forest-match unit** (a TAB group is one
slot). They must **not** serialize sibling WINDOW settle or hold
overlay/focus on buried members.

## Hide-place-show (general + layout)

**User-visible problem:** map at Mutter’s default rect, then
`move_resize` to the Forest slot — fly-in.

**Choice:** for will-TILE maps (layout PlaceNext **and** ordinary
Launch / open-into-slot): hide the actor at map, admit + command
Forest dest (`forestSlotPaintRect`), then show.

**Rejected:** minimize (tree/mode lie); FLOAT-as-hide; showing then
moving; map-time raw `move_to_monitor` as the product place (dock
sticky last-resort stays).

Existing CL8 `layout-deferred-open.js` is LayoutBatch-only. **Extend
that API** (contracts: deferred hidden open) so PlaceNext / general
TILE launch uses it. Unhide after dest command, not at batch end if
the window is already placed.

## Overlay vs Done (amends D071)

| Event | Overlay | Done.ok |
| --- | --- | --- |
| Apply start | show | — |
| Visible-hard | **hide** | not yet if buried required slots pending |
| Forest-match / cancel / error | hide if still up | D041 / fail |

Do **not** wait for buried TAB members or other-monitor slots to
ε-settle before hiding overlay (D105). Soft residual may continue
after overlay is gone (pin still catches steal).

## Focus (amends SM5 “after all-hard”)

Keyboard focus once **all required apps have mapped windows**, not
once every slot is ε-hard. Do **not** focus during open/place of the
first map. Open-leaf **raise** is earlier (group-has-a-window) and is
**not** keyboard focus.

## Acceptance

- [x] D117 in `design.md` + CHANGELOG; D071 overlay-until-Done marked
      superseded for **overlay lifetime** (Done.ok unchanged)
- [x] `project.md` apply spine + `docs/dev/contracts.md` settle row +
      `docs/user/layout.md` match D117
- [x] Hide-place-show: will-TILE map is not visible at the default
      rect then jumped; unit proves hide before dest write, show after
- [x] Launch order unit: given TAB(A active, B buried) + TILE C →
      spawn A before C before B (or A∥C before B if C is other-visible;
      A before B always)
- [x] Independent settle: sibling WINDOWS’ hard-wait do not block each
      other (unit / slot machine)
- [x] Group-has-window → `revealGroupChild` / raise open leaf before
      buried maps; nest oracle: strip shows `active` once first map
      exists
- [x] Focus after all required maps; not after first map; not gated on
      buried ε
- [x] Overlay gone at visible-hard; nest must not fail because a
      buried peer is still settling
- [x] No `wm_class=` product branch; no `force: true`; no `Mark2Drop*`;
      no Forest←GObject dual-write; proto brake; `_forge-test-*` only
- [x] Nest stopped; tests only for what the slice can break

## Implementation slices

| Slice | What | Exit |
| --- | --- | --- |
| **V0** | D117 lock + spine in design / CHANGELOG / project / contracts / user layout | **done** 2026-09-04 |
| **V1** | Hide-place-show: extend `layout-deferred-open.js` + PlaceNext/map admit | **done** — hide before dest, show after |
| **V2** | Spawn order bands; chaos shuffle not product; independent settle | **done** — A then C then B; per-WINDOW hard-wait |
| **V3** | Raise open leaf when group has ≥1 mapped WINDOW | **done** — `pickOpenLeafToRaise` + `revealGroupChild` |
| **V4** | Focus when all required mapped | **done** — focus phase before hard-ready |
| **V5** | Overlay clear at visible-hard | **done** — hunt `visible-hard overlay clear` |
| **V6** | Nest: visible-first open + overlay; hide-place-show if nest can see opacity | **done** — `leaf.settle.visible-first-open` PASS; no opacity oracle |

**Order:** V0 **done**. V1–V6 (one implementer; shared apply files).
Implementer follows **this plan** + `design.md` § Visible-open.

## Do not

- Invert D115 heal ladder or D041 Done.ok
- Hold overlay / focus / next-act on buried or other-mon ε
- Minimize-as-hide; FLOAT-as-hide
- Reintroduce belt / Mode B / map-time `move_to_monitor` as place
- Host `forge layout vinyl` / `dev`; commit/push unless asked
- Re-run unrelated green suites

## Context for the next agent

- Hide: `layout-deferred-open.js` `shouldDeferHiddenOpen` (will-TILE, not
  batch-only) + `shouldShowDeferredAfterDest`. Map path:
  `adapter-map-admit.js` hide → `moveLiveToForestSlot` → show.
  LayoutBatch dest-miss stays hidden. Dock sticky last-resort only.
- Spawn: `orderOpenActionsVisibleFirst` (`layout-apply-visible.js`).
  Chaos shuffle still test-only (`flags.chaos` + cocktail). Chrome
  `chromeSerialWaitPins` unchanged (same-process pair only).
- Settle: `startSlotMachines` per-WINDOW `waitHardReadyOnSignals`;
  `machine.windowSettle`. Slot still TAB/TILE match unit for Done.ok.
- Raise: `raiseOpenLeafAfterMap` → `revealGroupChild({ keyboard: false })`
  when intended leaf is already mapped.
- Focus: `APPLY_LAYOUT_PHASES` has `focus` **before** `hard-ready`.
  Gate: `focusAfterAllMappedAllowed` (missing pins fail at **open**).
- Overlay: `_maybeClearChromeVisibleHard` / hunt `visible-hard overlay
  clear`. `_finish` still clears leftover. Done.ok = D041.
- Nest: `leaf.settle.visible-first-open` PASS. Hide-place-show has **no
  nest opacity oracle** (unit only).

## Session note

2026-09-04 V0 — D117 locked in `design.md` § Visible-open + CHANGELOG
(D071 chrome overlay lifetime **superseded**; `_finish` leftover
cancel-clear kept; Done.ok stays D041). Cross-lock: Geometry loop
table, apply spine, `project.md` cold spine / Show-focus, contracts
settle + hide-place-show / overlay / focus jobs, `docs/user/layout.md`
+ troubleshooting leftover-dim. Overview + `agents build`.

2026-09-04 V1–V6 **code** — hide-place-show (will-TILE); visible-first
spawn A→C→B; per-WINDOW slot hard-wait; raise open leaf on map; focus
phase before hard-ready (all mapped, not all-hard); overlay
`visible-hard overlay clear`. Nest `leaf.settle.visible-first-open`
PASS; nest **stopped**. Chrome serialize kept for chrome-family pairs
only. No `force:true` / D026 reconnect / D115 invert. Gap: nest cannot
see actor opacity (hide-place-show is unit). Overlay bag test with
multi-role census still often clears at Done if other visible TILEs
are absent from the sparse `loadWindows` fixture — product census is
full.
