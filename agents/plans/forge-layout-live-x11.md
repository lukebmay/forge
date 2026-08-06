# Plan: Layout live X11 (tab apply, extract, multi-mon, drag)

**Status:** active  
**Priority:** P0 daily-driver on black  
**Created:** 2026-08-06  
**Host:** black — X11, dual 4K, Shell 46  
**Branch:** `plan/forge-layout-live-x11`

## Why

Operator rebooted into X11 and live-drove `forge layout dev` + Nautilus + tab
moves. Several daily-driver failures showed up; the desk after the last
`forge layout dev` still has mon0 untabbed (evidence for LX1).

## Operator session (2026-08-06)

| Step | Result |
| --- | --- |
| `forge layout dev` (first) | Worked |
| Open Nautilus | Landed well |
| `forge layout dev` again | Moved Nautilus into Ghostty tab group (good) |
| Move Nautilus out of tab group (keybinds) | **Needed keybinds** — tab drag does not relocate tiles |
| After pop-out | **Two thin vertical slivers** — should split on largest tab-group dimension toward square |
| Move Nautilus across monitors | **Failed** |
| Close all but Ghosttys → `forge layout dev` | Left mon **no tabs**; right only **2/3** tabs |
| Second try | Right **3/3** tabs; left still **untabbed** |

## Live tree after final `forge layout dev` (evidence)

```
mon0 HSPLIT: Grok | Chrome | Ghostty     ← should be TABBED(Chrome,Grok)|ghostty
mon1 HSPLIT: HSPLIT(ghostty) | TABBED(YT, Voice, Gmail)
```

Dry-run after: `thrashState tabbed-roles-not-grouped:mon0.s0`, planned
`ensure_layout mon0.s0 tabbed` for chrome+Grok — **plan correct, live apply flaky**.

## Tasks

| ID | Task | Pri | Status |
| --- | --- | --- | --- |
| **LX1** | [tab-apply ghostty reHUP](./completed/forge-layout-live-x11_lx1-tab-apply-rehub.md) | P0 | **Done** A/B AGREE |
| **LX2** | [split orient on tab extract](./completed/forge-layout-live-x11_lx2-split-on-tab-extract.md) | P1 | **Done** A/B AGREE |
| **LX3** | [cross-monitor move](./completed/forge-layout-live-x11_lx3-cross-mon-move.md) | P1 | **Done** A/B AGREE |
| **LX4** | [tab drag relocate](../tasks/forge-layout-live-x11_lx4-tab-drag.md) | P1 | ready (next) |

Related (separate): [mon-order X11 reverse](../tasks/forge-layout-mon-order-x11-reversed.md) —
not confirmed this session (roles looked L/R correct; tab apply was the fail).

## Order

1. **LX1** first — layout dev is the daily entry; agent reHUP test must pass **twice**.
2. **LX2** — extract geometry; uses existing `determineSplitLayoutForRect`.
3. **LX3** — keybind move across mons.
4. **LX4** — tab chrome drag → DnD drop zones (larger surface).

## Session note

**2026-08-06 LX3 done (A/B AGREE):** MONITOR move no longer gated on mon
first/last child — neighbor mon always geometry-then-reparent (one-shot
peel+cross for nested/tab). Next: **LX4** tab drag.

**2026-08-06 LX2 done (A/B AGREE):** Peel reorient from tab group aspect.

**2026-08-06 LX1 done (A/B AGREE):** FLOAT forceSplit for residual tab ensure.
