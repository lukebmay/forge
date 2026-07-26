# Task — OP-opt: tiny-pane → tab fallback

**Status:** Done (A/B **AGREE**)
**Plan:** [forge-daily-driver.md](../../forge-daily-driver.md)  
**Priority:** Optional QoL  
**Kind:** Plan-linked

## Problem

OP1 aspect-splits LFT 50/50 even when both panes become postage stamps
(especially nested splits / already-narrow tiles). User sees tiny unusable
windows and has to retab by hand.

## Design locks

| Topic | Decision |
| --- | --- |
| Trigger | Only on **open-app aspect split** path (`_maybeAspectSplitForOpen`), not manual split keybinds |
| Rule | After proposed 50/50 of LFT rect, each child **width and height** must be ≥ threshold; else **TABBED** instead of H/V split |
| Threshold | `max(app min-size if known, setting min-edge px, ~12% of min(workarea.w, workarea.h))` — pure helper takes numbers |
| Default | **Off** — preserve current “allow small splits” until user opts in |
| Setting | Boolean enable + uint min-edge px (default **320**) |
| Not area % | Do **not** use raw area fraction (fails ultrawide short panes) |
| PlaceNext / dock | Same rule when aspect-split path runs; if parent already tab/stack, unchanged |
| Manual split | Out of scope |

### Pure helper sketch

```js
// lft-mru.js or open-app pure module
function shouldTabInsteadOfSplit({
  lftWidth, lftHeight,
  workareaMinEdge,   // min(wa.w, wa.h)
  minEdgePx,         // gsettings default 320
  appMinW = 0, appMinH = 0,
  enabled = false,
}) → boolean
// proposed half sizes: halfW = lftWidth/2, halfH = lftHeight (HSPLIT)
// or halfW = lftWidth, halfH = lftHeight/2 (VSPLIT from aspect)
// threshold = max(minEdgePx, floor(0.12 * workareaMinEdge), appMinW/H per axis)
// return true if either axis of either child would be < threshold
```

Orientation still from `aspectOrientationFromRect`; only the **decision**
split-vs-tab changes.

### Tab path when fallback fires

Prefer existing tree helpers: if LFT parent already TABBED, insert after LFT
(no split — already handled by `isTabOrStackParent`). Else convert path:
create TABBED container around LFT (same as join-as-tab / applyDefault when
tabbed mode) so new window becomes a sibling tab — mirror how center-DND or
default tabbed layout creates a tab group. Inspect `tree.split` +
`applyDefaultLayoutToContainer` / tab join for least-surprise API.

## Goals

1. Pure `shouldTabInsteadOfSplit` (+ unit tests)  
2. GSettings: enable (default false) + min-edge (default 320)  
3. Wire into `_maybeAspectSplitForOpen` only  
4. Prefs toggle if easy (settings page); else gsettings-only OK for MVP  
5. DESIGN.md short note  
6. `npm test` green  

## Acceptance

- [x] Enabled + LFT rect that would yield half-edge &lt; threshold → tab group, not split  
- [x] Enabled + large LFT → still aspect split as today  
- [x] Disabled (default) → behavior identical to OP1  
- [x] Pure tests cover threshold math (min-edge, 12% workarea, app min)  
- [x] Manual split keybinds unchanged  
- [x] `npm test` green  
- [x] DESIGN note  

## Out of scope

- Retab existing postage stamps  
- Resize-driven auto-tab  
- OP1 dock sticky changes  
- FC / workon  

## Code touch list (expected)

| Area | Notes |
| --- | --- |
| `lib/extension/lft-mru.js` | pure helper |
| `lib/extension/window.js` | `_maybeAspectSplitForOpen` |
| `schemas/…gschema.xml` + compile | two keys |
| `lib/shared/settings-keys.js` if listed | allowlist |
| tests | pure + open-app-policy cases |
| DESIGN.md | short section |

## Session note

**B AGREE (2026-07-26).** No blockers/majors. Ship as-is.

### B verify
1. **Math** — `shouldTabInsteadOfSplit`: `base = max(minEdge, floor(0.12*waMin))`;
   per-axis `max(base, appMin)`; H/V half sizes; fail either axis → tab. Matches design.
2. **Scope** — only `_maybeAspectSplitForOpen`; command/LayoutSplit/keybind splits untouched.
3. **Default off** — `enabled=false` early-return; schema default false; fixture false;
   policy test disabled path still HSPLIT.
4. **Schema** — b false / u 320; `settings-keys` + `settings.schema.json` + prefs switch;
   gsettings dry-check types OK.
5. **`npm test`** — **1879 passed** (184 files).
6. **Nits (non-blocking):** app min from LFT not new meta; no prefs spin for min-edge
   (MVP OK); useTab also requires `tabbed-tiling-mode-enabled` (sensible, undoc in DESIGN).

### A shipped (kept)
- Pure helper + wire + GSettings + prefs + DESIGN + tests as listed by A.
