# Plan: forge-wayland-live

**Status:** in progress  
**Branch:** `plan/forge-wayland-live`  
**Created:** 2026-08-04  
**Host:** black — GNOME Shell 46, **Wayland**, dual 4K @ 1.5 scale

## Goal

Make Forge reliable on Wayland for daily driver: auto-tile, fair shares, layout
dev multi-window, borders that do not steal clicks, floats (Guake) on the
focused monitor. **No X11 regressions.**

## Live findings (2026-08-04)

| Symptom | Evidence |
| --- | --- |
| New apps tile with **width 0** / **negative width** | Nautilus `rect width=0`; Grok `width=-836` after `layout dev` |
| Sole tile has `percent=1` | After close, ghostty mon0/mon1 both `percent=1` |
| Late identity at map | Journal: `Meta Window null 0` (title null, type NORMAL) on create |
| Empty title floats | `isFloatingExempt` floats null/empty title; only `notify::wm-class` re-renders |
| Skip share when float-exempt at map | `insertChildPercent` gated on `!isFloatingExempt` → late tile keeps sibling at 1.0 |
| Mixed percents in `computeSizes` | Child A `percent=1`, B `percent=0` → weights 1.0 + 1/n → remainder crush → 0 / negative |
| `layout dev` incomplete | Grok wait timeout 15s despite PWA class in `seenClasses`; chrome landed mon1 not mon0 |
| Borders / chrome click | Border actors above window; likely reactive + HiDPI offset |
| Guake wrong mon | Float; needs focus-monitor placement (not yet instrumented this session) |

## Root causes (priority)

1. **P0 — size math:** `computeSizes` must not mix absolute percent with equal-magic without renormalizing; never emit negative sizes.
2. **P0 — late tile share:** when FLOAT→TILE (late title/class), carve share via `insertChildPercent` (or equivalent).
3. **P0 — late title:** `notify::title` re-render like `notify::wm-class` (bug #482 pattern).
4. **P1 — pointer-transparent chrome:** focus/selection/split borders `reactive = false`.
5. **P1 — layout open wait / PlaceNext** on Wayland (null title/class at map; PWA class stems).
6. **P2 — Guake / dock mon:** focused monitor for float dropdowns; dock sticky under 1.5 scale.

## Non-goals

- Full CSS theme redesign (user colors later).
- Closing Ghostty windows during live tests.
- Auto-promote `test`/`prod`.

## Tasks

| ID | Task | Status |
| --- | --- | --- |
| W1 | Size normalize + late-tile share + title signal + border non-reactive | **done** |
| W2 | Layout open wait / PlaceNext / multi-chrome on Wayland | **done** |
| W3 | Guake + dock mon focus placement | **done** |
| W5 | Layout residual + PWA icons/place + full belt | **done** (975ed17) |
| W3b | Cross-mon move + Guake pointer + first stale-border fix | **done** (`42c8751`) |
| W3c | Border registry / node ownership / tighter slot prefer | **done** (this session) — **logout smoke required** |
| W4 | Wayland thrash smoke (lock Super+Delete) | **next** after storm harden + border smoke |
| **W-storm** | Eliminate render storms (title/class/size/entered-mon feedback) | **done** (A/B AGREE) — logout smoke to confirm |
| W6? | Session backend split (wayland vs x11 modules) | **later** — plan + approve after stable gate |

## Session note

**2026-08-05 W-storm done (A/B AGREE):** Root-cause guards — title/class identity
retile only when policy can flip; `_suppressGeometrySignalRetile` around apply/move;
TILE in-slot size-changed chrome-only; entered-monitor no render when already home.
Tests: `bug-w-render-storm` + W1/#482/#461 + unit/window green. **Logout** to load.
Next: live smoke (Nautilus path, Ghostty titles) then W4 thrash. Do not merge master
until operator confirms. Completed task:
`agents/plans/forge-wayland-live/completed/forge-wayland-live_w-render-storm.md`.

