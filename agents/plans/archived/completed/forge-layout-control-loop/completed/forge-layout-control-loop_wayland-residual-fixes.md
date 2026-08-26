# Task: forge-wayland-live_residual-fixes

**Status:** done (unit/CLI green; live recheck on black for icons + open place + hints)  
**Plan:** residual on `plan/forge-layout-control-loop` (Wayland smoke follow-ups)  
**Branch:** `plan/forge-layout-control-loop`  
**Created:** 2026-08-06  
**Host:** black — dual 4K @ 1.5; GNOME Shell 46 **Wayland**

## Context

Operator Wayland smoke of `forge layout dev` was mostly good (a bit slow). Residuals:

| # | Symptom | Expected |
| --- | --- | --- |
| 1 | Tab icons wrong: Gmail → YouTube icon; Grok → Google Chrome icon | Each Chrome PWA tab shows its own desktop icon |
| 2 | Ghostty opened by layout had cwd = forge repo (not home) | CLI launches use `$HOME` (or desktop Path=); not the shell that ran `forge layout` |
| 3 | Open Nautilus with mon1 Ghostty focused → window at **mon root end**, not under focused unit | Default **aspect split** of focused/LFT tile (longer dim → V/H); attach under that unit |
| 4 | Drag Nautilus to **vertical** split feels too hard | Top/bottom drop zones as easy as left/right (distance-based edges) |
| 5 | Tiling preview hints may stick and ruin session (logout) | Hints may be **on**; must **never** stick — hard cleanup + failsafe |

Topology reference after layout (ws0):

```
mon0 HSPLIT: TABBED(chrome,Grok) | ghostty
mon1 HSPLIT: CON(ghostty alone leftover) | TABBED(YouTube,Gmail,Voice)
```

PWA desktop files use `StartupWMClass=crx_<id>` while Meta reports `chrome-<id>-Default` — WindowTracker often binds wrong/generic Chrome; need chrome-id lookup + rebuild tab when app identity changes.

## Scope

- `lib/extension/tree.js` — app resolve + `refreshApp` when app id changes  
- `lib/extension/place-hint.js` — reuse `chromePwaAppId` (already there)  
- `lib/extension/window.js` / open placement — focus/LFT attach + aspect split  
- `lib/extension/utils.js` + `drag-drop.js` — drop zone hit testing; preview never sticks  
- `scripts/forge/forge` (+ tests) — launch `cwd=HOME`  
- Unit tests for pure helpers / regression

## Out of scope

- Full layout-dev thrash redesign  
- Merge to master (operator green first)

## Acceptance

1. **Icons:** Given wm_class `chrome-<id>-Default` and a matching `chrome-<id>-Default.desktop`, tab icon comes from that app (not sibling PWA / bare Chrome) when AppSystem can resolve it. `refreshApp` rebuilds tab when resolved app id changes.  
2. **cwd:** `launch_app` / Ghostty multi-instance `Popen` uses `cwd=os.path.expanduser("~")` (document; unit or pytest if launch helpers are tested).  
3. **Open place:** With auto-split on and LFT/focus a non-tabbed tile, new tile attaches as aspect-split sibling of that unit (not mon-root third sibling when LFT is under mon). Prefer focused tile when it is a live tile under the home mon.  
4. **DnD:** `detectDropZone` (or successor) prefers **nearest edge** among left/right/top/bottom so vertical splits are not starved by left/right-first priority in corners / near mid-edges. Center still wins in center band. Existing tests updated.  
5. **Hints:** Preview actors only created when `preview-hint-enabled`; all previews destroyed on grab end, disable, and when setting turns off; failsafe max age clears any orphan (no permanent full-screen dim). Document in short comment or DESIGN/DECISIONS only if non-obvious.

## Tests

- Unit: chrome PWA app resolve helper; refreshApp app-id change; detectDropZone nearest-edge; open placement attach (existing lft-mru + any new)  
- `npm test` / vitest for touched suites; pytest for forge launch cwd if present  

## Session note

**2026-08-06:** Implemented + B AGREE. vitest 2166; pytest Ghostty launch cwd 2.  
Shipped: PWA app resolve + refreshApp id change; launch cwd=$HOME; focus tile attach prefer; nearest-edge DnD; preview clearAll + 8s failsafe + no create when off.  
**Operator next:** reinstall/HUP (or Wayland re-enable), re-run layout dev, check PWA tab icons, open Nautilus under mon1 ghostty, enable preview-hint and abort a drag, confirm no stuck dim.
