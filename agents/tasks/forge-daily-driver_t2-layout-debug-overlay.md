# Task — T2: Opt-in layout debug overlay

**Status:** Ready after T1  
**Plan:** [forge-daily-driver.md](../plans/forge-daily-driver.md)  
**Analysis:** [forge-layout-thrash-analysis.md](../plans/forge-layout-thrash-analysis.md) § sizing / overlays  
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

- [ ] Off by default
- [ ] Toggle shows/hides without reload
- [ ] Disable extension removes overlay actors
- [ ] Useful enough to diagnose 1:2 vs 50–50 and wrong monitor after wake
- [ ] Keybind is modifier-heavy (T5-safe)

## Out of scope

- Permanent pin icons / production size chrome
- Pin-to-tile editing via overlay
- Full flex model UI

## Session note

(empty — next agent fills)
