# Plan: CSS base + user overrides (no clobber)

**Status:** in progress  
**Branch:** `plan/forge-css-overrides`  
**Updated:** 2026-08-06  
**Priority:** P0 (day-to-day — personal colors keep getting wiped)

**C0:** done — dual-load + non-destructive `patchCss` (see `completed/`).

## Problem

User theme lives at `~/.config/forge/stylesheet/forge/stylesheet.css` as a **full fork** of the bundled sheet. On enable, when `css-last-update` ≠ `ThemeManagerBase.cssTag`, `patchCss()` **overwrites** that file with bundled defaults (only keeps `.bak`). Custom colors (e.g. dark purple focus) vanish after upgrades / reinstalls / tag bumps.

Prefs → Appearance edits the same full file. Structural rules (split-edge `border-radius: 0`, layout-debug, cheatsheet, apply chrome) must be re-copied into the user file or they lag the extension.

## Design (approved)

| Layer | Role |
| --- | --- |
| **Bundled** `extension/stylesheet.css` | Always loaded as **base** (structure + defaults) |
| **User override** `~/.config/forge/stylesheet/forge/stylesheet.css` | Only **deltas** the user cares about (colors, widths, radii they set) |
| **St load order** | Load base, then user (user wins cascade) |
| **Upgrade / cssTag** | Never full-file replace. Tag only for **rename migrations** (search/replace known selectors) |
| **Prefs** | Read effective value = user override if present else base; write **only** changed props into the user file |

### Explicit non-goals

- Changing Forge’s **default** palette for everyone
- Requiring a full reboot for theme reload (keep Super+Shift+r / `css-updated`)
- Dropping Appearance prefs (they still edit overrides)

### Migration

On first enable after this lands (or one-shot tool):

1. If user file missing → create empty or minimal comment-only file (no seed of full defaults).
2. If user file is a **full copy** of some prior default with edits → keep it as-is for dual-load (full file as “override” still works: every rule overrides base). Optional later: strip rules identical to current base.
3. **Never** overwrite an existing user file with bundled defaults.

### Side indicator (curl)

Structural: `.window-split-horizontal` / `.window-split-vertical` keep `border-radius: 0` in **bundled** base only. User overrides should not need to restate that unless they intentionally change it.

## Tasks

| ID | Task | Status |
| --- | --- | --- |
| **C0** | Dual-load base+user; kill destructive `patchCss`; unit tests | **done** → `completed/forge-css-overrides_c0-dual-load.md` |
| **C1** | Prefs: delta-only writes; reset clears override | **next** → `../tasks/forge-css-overrides_c1-delta-writes.md` |
| **C2** | Docs (`theming.md`, DESIGN/DECISIONS); scripts (`restore-theme`, stamp, migrate notes) | pending |
| **C3** | Optional polish / migrate-only tools | optional |

## Acceptance (plan-level)

- Custom purple focus survives reinstall / cssTag bump without manual restore.
- Bundled structural fixes apply even if user file is old / color-only.
- Appearance color change still live-reloads and persists in user file only.
- Unit tests cover: no clobber; load order; setCssProperty does not require full base in user file.

## Session note

**C0 shipped (code on `plan/forge-css-overrides`, unit green 2255).**  
Load: bundled base then `~/.config/forge/stylesheet/forge/stylesheet.css`. `patchCss` only stamps `css-last-update` (+ empty rename hook); never copies defaults over user. Reads fall back to base AST; writes always user file. Fresh user path seeds comment-only, not full fork.

**Next:** C1 — prefs write delta props only / avoid full-user-AST bloat when editing Appearance on a color-only or full-fork sheet.  
**Verify live:** custom colors survive cssTag bump + Super+Shift+r; Appearance still applies.
