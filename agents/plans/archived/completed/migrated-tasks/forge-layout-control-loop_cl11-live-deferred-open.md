# Task: forge-layout-control-loop_cl11-live-deferred-open

**Status:** superseded 2026-08-09 — control-loop verify-war era; do **not** reimplement  
**Plan:** historical [forge-layout-control-loop.md](../plans/forge-layout-control-loop.md)  
**Branch:** master  
**Created:** 2026-08-05

## Goal

Live retest deferred hidden parallel open on black after CL8–CL10.

## Pass order

| Pass | Session |
| --- | --- |
| **1. X11** | Now (HUP already done via `./install --dev`) |
| **2. Wayland** | After X11 green — logout residual |

## Acceptance (operator)

1. Sole Ghostty (or clean-ish session) → `forge layout dev`
2. Opens feel **less jumpy**: no temporary tiny H/V slivers; apps not thrashing focus mid-open
3. Parallel open still **reasonably fast**; final tree matches profile:
   - mon0: chrome + Grok | ghostty
   - mon1: ghostty | YouTube / Gmail / Voice
4. Residual **focus** matches layout profile focus
5. Optional trial:  
   `gsettings set org.gnome.shell.extensions.forge layout-apply-chrome-enabled true`  
   then layout again; chrome must **never stick** (≤8s hard clear; disable if annoying)
6. Record X11 then Wayland residuals only

## Session note

Install done 2026-08-05 (`v49-90-beta.2-148-g3b551b3`). Awaiting operator live.
