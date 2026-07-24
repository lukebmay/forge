# Task — T2: Opt-in layout debug overlay

**Status:** Done  
**Plan:** [forge-daily-driver.md](../../forge-daily-driver.md)  
**Analysis:** [forge-layout-thrash-analysis.md](../../forge-layout-thrash-analysis.md) § sizing / overlays  
**Priority:** P2 (bring forward for debugging T3/T4)  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-daily-driver/completed/`

## Problem

Tile percents, layout enums, and monitor homes are hard to inspect live. User
agrees overlays help **human debugging** and wants them **sooner rather than
later** (opt-in, not permanent production chrome). Agents debugging blank/wake
and ratios benefit too.

## Goals

1. GSettings flag e.g. `layout-debug-overlay-enabled` (default **false**).
2. Keybind to toggle — use **Ctrl+Super** or **Shift+Super** chord (not bare Super+letter).
3. When on, show compact per-window (or per CON) hints:
   - layout of parent (HSPLIT/VSPLIT/TABBED/STACKED)
   - `percent` or `auto` if 0
   - monitor node id / index
   - optional: min-size hint if easy
4. Zero impact on layout math when off; cheap when on (update on render/focus).
5. Document in troubleshooting or cheatsheet.

## Code touch list

| Area | Notes |
| --- | --- |
| Prefs + schema | new boolean + keybinding key |
| Overlay actors | prefer decoration/focus layer or small St labels; tear down on disable |
| Render hook | after `processNode` / focus change — avoid leaking actors on disable() |

## Acceptance

- [x] Off by default
- [x] Toggle shows/hides without reload
- [x] Disable extension removes overlay actors
- [x] Useful enough to diagnose 1:2 vs 50–50 and wrong monitor after wake
- [x] Keybind is modifier-heavy (T5-safe)

## Out of scope

- Permanent pin icons / production size chrome
- Pin-to-tile editing via overlay
- Full flex model UI

## Session note

**T2 done (A/B AGREE, 2026-07-24)** — TF-B **AGREE** (nits only).

| Surface | Detail |
| --- | --- |
| Setting | `layout-debug-overlay-enabled` (bool, default false) — main schema + development config-sync |
| Keybind | `layout-debug-overlay-toggle` default `['<Ctrl><Super>d']` |
| Command | `LayoutDebugOverlayToggle` |
| Module | `lib/extension/layout-debug-overlay.js` — `formatLayoutDebugLabel`, `layoutDebugInfoFromNode`, `LayoutDebugOverlay` |
| Label | parent layout, percent/`auto`, monWs id, optional `min:WxH` |
| Hook | `renderTree` after borders; settings change show/clear; `disable()` → `destroyAll()` |
| Prefs | Settings → Debugging switch (always visible); Keyboard “Layout debug” group |
| Docs | `docs/user/troubleshooting.md`, keybindings defaults table |
| Style | `.window-layout-debug-label` in `stylesheet.css` |

Tests: `tests/unit/extension/layout-debug-overlay.test.js` (+ command/keybindings).  
`npm test`: **171 files, 1631 tests passed**.

Next: **T3** blank/wake + tab survival (+ h1-verify).
