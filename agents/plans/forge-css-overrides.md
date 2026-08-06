# Plan: CSS base + user overrides (no clobber)

**Status:** complete (C0–C2; C3 optional)  
**Branch:** `plan/forge-css-overrides`  
**Updated:** 2026-08-06  
**Priority:** P0  

## Problem

User theme was a full fork of the bundled sheet. On enable, `patchCss()` overwrote
it when `css-last-update` ≠ `cssTag`. Custom colors vanished after upgrades.

## Design (shipped — D001)

| Layer | Role |
| --- | --- |
| **Bundled** `stylesheet.css` | Always loaded first (structure + defaults) |
| **User** `~/.config/forge/stylesheet/forge/stylesheet.css` | Overrides only; cascade wins |
| **Upgrade** | `patchCss` stamps / optional renames — **never** full-file clobber |
| **Prefs** | Write deltas; strip identical-to-base; Reset removes override |

## Tasks

| ID | Task | Status |
| --- | --- | --- |
| **C0** | Dual-load + non-destructive `patchCss` | **done** → `completed/forge-css-overrides_c0-dual-load.md` |
| **C1** | Delta-only writes; reset clears override | **done** → `completed/forge-css-overrides_c1-delta-writes.md` |
| **C2** | Docs + scripts | **done** (theming.md, DESIGN/DECISIONS, forge scripts) |
| **C3** | Optional polish / color normalize | optional |

## Session note

**C0–C2 done (A/B AGREE on C0/C1; C2 docs/scripts orchestrator).**  
Live: operator purple under `~/.config/...`; next Appearance write will strip full-fork noise.  
`make dev` / Super+Shift+r to pick up dual-load on Shell.  
**Next priorities:** layout workspace scope (WS0–WS3).
