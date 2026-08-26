# TZ-tab-apply — Structure ensure must yield TABBED

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Done (A/B AGREE)
**Priority:** P0  
**Task force:** A implement → B verify  

## Problem

Live dump after structure repair attempt:

```text
CON HSPLIT
  Ghostty
  CON HSPLIT
    Facebook
    Chess
```

wanted:

```text
CON TABBED
  Ghostty | Facebook | Chess
```

Container model: H/V → TABBED flattens (lossy). Apply path today:
`layout tabbed` + `move` onto first id — must leave **TABBED**, not nested HSPLIT.

## Goal

- Trace CLI `actions_to_extension_steps` + extension `_layoutOp` / `_moveOp`.  
- Fix so multi-window tab ensure ends as one TABBED CON with all windowIds.  
- Unit and/or regression test (GJS if extension; pure if only CLI ordering).  

## Acceptance

- [x] Reproducing steps documented  
- [x] Fix: nested H/V input or mon-direct siblings → TABBED bag  
- [x] No dual-mon rewrite  
- [x] Tests green  
- [x] task + plan notes  

## Non-goals

- Mode B park policy  
- Thrash detection heuristics  

## Session note

**Root cause:** `_layoutOp` set `parent.layout = TABBED` but left nested CON
children intact. Ensure path (`layout` on first windowId + `move` others onto
it) could leave `TABBED(win, HSPLIT(win, win))` or nested HSPLIT when layout
never effectively bagged windows.

**Fix choice (A, product model):** H/V → TABBED|STACKED **flattens** in
`_layoutOp` via `_flattenLayoutParentToWindows` (peel nested CONs until only
WINDOW leaves). CLI order unchanged: layout first (mon-wrap + flatten), then
moves fold mon-direct siblings. No touch to tab click / FocusManager / deco.

**Repro steps (nested H/V):**
1. Tree: `CON HSPLIT → Ghostty | CON HSPLIT(FB, Chess)`.
2. `layout tabbed` selector `id:Ghostty` → outer becomes flat `TABBED` with
   three window children; `lastTabFocus` = Ghostty.
3. Optional moves of FB/Chess onto Ghostty are no-ops / reorder only.

**Repro steps (mon-direct):**
1. mon HSPLIT: Ghostty | FB | Chess.
2. `layout tabbed` on Ghostty → mon-wrap CON TABBED(Ghostty).
3. `move` FB, Chess → dest Ghostty → all three under that CON.

**Files:** `lib/extension/session-api.js`, `scripts/forge/workon_apply.py`
(comment), `tests/regression/bug-tz-tab-apply-flatten.test.js`,
`tests/unit/cli/test_workon_apply.py`.

**Tests:** pytest cli 179; vitest flatten 3 + bug-tab-click-activate 5 green.

**Next:** TZ-gate (B verify this task first).
