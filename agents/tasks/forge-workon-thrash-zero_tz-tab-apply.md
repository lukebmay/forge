# TZ-tab-apply — Structure ensure must yield TABBED

**Plan:** [forge-workon-thrash-zero.md](../plans/forge-workon-thrash-zero.md)  
**Status:** Ready (can start after TZ-detect analysis; parallel OK with TZ-recover if careful)  
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

- [ ] Reproducing steps documented  
- [ ] Fix: nested H/V input or mon-direct siblings → TABBED bag  
- [ ] No dual-mon rewrite  
- [ ] Tests green  
- [ ] task + plan notes  

## Non-goals

- Mode B park policy  
- Thrash detection heuristics  

## Session note

(next agent fills)
