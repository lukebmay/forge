# Plan: forge-wayland-operator-residuals

**Status:** done (WR1+WR2 A/B AGREE)  
**Branch:** `plan/forge-wayland-operator-residuals`  
**Created:** 2026-08-06  
**Host:** black — dual 4K @ 1.5; GNOME Shell 46 **Wayland**  
**Related:** [forge-wayland-live residual smoke](../tasks/forge-wayland-live_residual-smoke.md), focus-no-reflow / intra-tab thrash (control-loop completed)

## Operator report (2026-08-06)

| # | Symptom | Expect |
| --- | --- | --- |
| 1 | **Guake** opens on **right** mon on Wayland | Left by default; **right only if focus is on right** (X11 behavior) |
| 2 | `forge layout dev` left tab group — **Grok not visible** | Profile `active: Grok` — Grok raised in mon0 tab strip |
| 3 | **Flicker** on web apps (Chrome PWAs) when changing focus (click tabs/apps); intermittent | No reflow / flash on focus |
| 4 | After focus dance: **Grok height ~¼ mon**, Chrome visible behind; **stuck** | Full tile slot; sibling not peeking |

Live evidence:

- Session type: **Wayland**
- Journal: `layout-controller: verify mismatch give-up … rect-mismatch` on Grok / other Chrome ids
- Tree still reports full slot rects for Grok while Meta frame drifts → verify give-up leaves bad client size
- Guake gsettings: `mouse-display=true`, `display-n=0`; session-layout save shows Guake **mon=1**
- Profile `shellrc/.../hosts/black/dev.json` has `"active": "Grok"`; dry-run emits `focus role=Grok reason=active` then profile focus ghostty

## Goals

1. Guake (and similar float drop-downs) appear on the **focus / LFT monitor**, not always right / primary-wrong.
2. After `forge layout dev`, tab **open leaves** match profile `active` (Grok raised; full slot size).
3. Focus changes do **not** thrash Chrome PWA geometry (no ¼→full flicker; no stuck ¼ height).
4. Verify/retry must not give up while leaving windows permanently undersized when a reassert is still safe.

## Non-goals

- Full container-motion / resize redesign
- Guake upstream patches (prefer Forge float rehome; document Guake settings if residual)
- X11 regressions

## Task order

| Task | File | Status |
| --- | --- | --- |
| **WR1** | [chrome geom + focus thrash](../tasks/forge-wayland-operator-residuals_wr1-chrome-geom-focus.md) | Done (A/B AGREE) |
| **WR2** | [Guake focus monitor](../tasks/forge-wayland-operator-residuals_wr2-guake-mon.md) | A done — await B |

## Session note


**2026-08-06 WR2 done (A/B AGREE):** Guake rehome to focus/LFT mon on map+focus. Plan complete pending operator live smoke (install + Wayland).


**2026-08-06 WR2 A:** Guake rehome to focus/LFT mon via pure
`resolveFloatFocusMonitor` + `_rehomeFocusFloatMonitor` (safeMove + sticky);
map + focus paths. Tests: lft-mru + guake-focus-mon green. Branch
`plan/forge-wayland-operator-residuals`. No commit yet. Live: install + F12 mon
check after B.

**2026-08-06 WR1 done (A/B AGREE):** Open-leaf focus reassert; pure rect-mismatch targeted reassert; give-up force reassert. Tests 975. Next: **WR2 Guake mon**. Live: install + Wayland logout after WR2 or intermediate install.

**2026-08-06:** Plan opened from operator Wayland smoke. Branch from master @ theme wrap.
