# forge-tab-click-slot — tab click shows wrong size (R025)

**Status:** done (L0 green; host live PASS 2026-08-14)
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-14

## Goal

Clicking a TABBED/STACKED tab reveals that window at the **group slot**,
not leftover FLOAT / pre-group geometry.

## Acceptance

- [x] `revealGroupChild` calls `reassertNodeToSlot` on the revealed child
- [x] Reassert runs **before** raise
- [x] `afterFocus` / `updateTabbedFocus` still do **not** reassert
- [x] Zoomed windows skip reassert (D030)
- [x] No `renderTree("focus")`
- [x] Live: after host tip, click a non-open tab — slot size, no ¼-height
      Chrome reflow on the already-visible sibling

## Session note

**2026-08-14 host live PASS** on tip `g4b2a374` (same reveal as R026).
After `layout dev`, revealed Chrome `2946577600` (was non-open sibling
of Grok `2946577601`) via `forge focus class:google-chrome --first`.

Rects (`forge tree`):

| Node | x,y | w×h |
| --- | --- | --- |
| left TABBED CON | 46,36 | **1255×1400** |
| Chrome `2946577600` | 46,71 | **1255×1365** |
| Grok `2946577601` | 46,71 | **1255×1365** |

Revealed Chrome matches the sibling and fills the group slot (35px tab
strip). Not ~¼-height (350) leftover FLOAT. Same rects at +0.3s / +1.8s
/ +4.8s. Agent Ghostty `2946577602` still TILE on mon1. No nest.
