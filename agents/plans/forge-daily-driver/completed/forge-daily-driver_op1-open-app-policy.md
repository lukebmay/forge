# Task — OP1: Open-app placement policy (LFT MRU + dock sticky)

**Status:** Done (A/B **AGREE**)  
**Plan:** [forge-daily-driver.md](../../forge-daily-driver.md) Phase D2  
**Analysis:** [forge-layout-thrash-analysis.md](../../forge-layout-thrash-analysis.md)  
**Priority:** P1  
**Kind:** Plan-linked

## Problem

New windows land unpredictably:

1. Dock launches sometimes flip to the wrong monitor (pointer / restore geometry
   races with attach).
2. Terminal/script opens do not reliably attach after the **last focused tile**
   (tab join broke; single `lastFocusedWindow` is weak).
3. Floats (Guake) can poison attach target.
4. No global + per-monitor MRU of tiled windows.

## Product lock (from plan)

| Source | Monitor home | Attach |
| --- | --- | --- |
| **Dock** (when detectable) | Sticky dock’s monitor (force Meta; grace vs re-home) | LFT **on that mon** if any; else mon root |
| **Terminal / generic** | **Global LFT’s** monitor (not pointer, not terminal seat) | After LFT (tab / aspect) |
| **No LFT** | mon **0** for generic; dock still dock mon | mon root |

**LFT MRU (ship both in this task):**

- **Global** ring: ordered tiled windows → terminal/generic attach
- **Per-monitor** ring: monIndex → ordered tiles on that mon → dock attach
- On tile focus: front of global + its mon ring
- On destroy/untrack: remove from both; floats never enter
- New mapped tile takes focus → becomes next LFT

**Insert shape:**

1. LFT parent TABBED/STACKED → insert **after** LFT in that CON
2. Else aspect: LFT taller than wide → VSPLIT; else HSPLIT
3. V1: no tiny-pane auto-tab (OP-opt later)

## Goals

1. **LFT MRU module** (prefer pure helper under `lib/extension/` or extractable
   logic on WindowManager/Tree) — global + per-mon rings; unit-testable.
2. Replace weak single `lastFocusedWindow` attach path with MRU heads while
   keeping `lastFocusedWindow` if other code still needs the pointer/focus field
   (or migrate call sites cleanly).
3. **Dock sticky mon**: detect dock-launched windows when possible; force
   home to dock monitor; attach via **LFT(m)** not global LFT.
4. **Generic open**: mon + attach from **global LFT**; no LFT → mon 0 root.
5. **Tab-after** + **aspect split** as above; focus-on-create so next open chains.
6. Clarify prefs/docs for `new-window-placement` vs OP1 policy (dock sticky + LFT).
7. Unit tests covering acceptance cases; `npm test` green.

## Code touch list (expected)

| Area | Notes |
| --- | --- |
| `lib/extension/window.js` | trackWindow mon home; `_resolveAttachTarget`; destroy/untrack; focus updates |
| `lib/extension/focus.js` | tile focus → MRU move-to-front (not floats) |
| New helper e.g. `lib/extension/lft-mru.js` | pure MRU rings if extractable |
| Schema / prefs / config-sync | only if placement enum/docs need update |
| `docs/user/monitors.md` | OP1 behavior |
| `docs/DESIGN.md` | short open-app / LFT note |
| Tests | `tests/unit/...` dock sticky, global LFT, Guake not in MRU, tab-after, aspect H/V, per-mon, focus chain |

## Acceptance

- [x] Global + per-mon LFT MRU update on tile focus; drop on destroy
- [x] Floats never enter MRU
- [x] Terminal/generic: mon + attach from **global LFT**; no LFT → mon 0
- [x] Dock (detectable): sticky dock mon; attach **LFT(m)** else mon root; no Meta flip race where policy can prevent it
- [x] Tab-after when LFT in TABBED/STACKED
- [x] Aspect split H/V from LFT rect when not in tab/stack
- [x] New tile focus becomes LFT for next open
- [x] Docs updated; unit tests pass; `npm test` green
- [x] No OP-opt tiny-pane; no forge CLI / workon

## Out of scope

- OP-opt min-edge tab fallback
- `forge launch` / DBus CLI (FC*)
- T6 full tree snapshot
- SSH / live black install

## Session note

**Shipped (A + B AGREE):**

- `lib/extension/lft-mru.js` — pure `LftMru`, `resolveOpenAppPlacement`,
  aspect + dock match helpers.
- `window.js` / `focus.js` — OP1 home/attach, dock sticky + grace, LFT lifecycle.
- B fixes: prefer mon LFT over stale cross-mon `attachNode`; dock hook
  rebinds active WM after disable/re-enable.
- Docs/prefs/schema labels; `pointer` setting id = LFT mon for compat.
- Tests: `lft-mru.test.js`, `WindowManager-open-app-policy.test.js` (+2 B
  regressions); bug-299 updated. `npm test` **1706 passed**.

**Key APIs:** `LftMru.touch/remove/globalHead/monHead`,
`resolveOpenAppPlacement`, `noteDockLaunch`, `_planOpenAppPlacement`,
`_lftTouchIfTile`.

**Next:** T6 full tree snapshot.
