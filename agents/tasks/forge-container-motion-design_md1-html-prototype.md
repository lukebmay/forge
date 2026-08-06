# Task: MD1 — HTML container-motion prototype

**Status:** ready  
**Plan:** [forge-container-motion-design.md](../plans/forge-container-motion-design.md)  
**Branch:** `plan/forge-container-motion-design` (or docs on master until locks)  
**Priority:** P1 design (after or parallel with workspace-scope; **before** peel/move Shell work)  
**Created:** 2026-08-06  

## Goal

Interactive single-page prototype so operator and agents can try peel Model B,
edge no-op, sibling move, join, and multi-tag selection **without** GNOME Shell.

## Acceptance

1. Page at `docs/dev/prototypes/container-motion.html` (vanilla HTML/JS/CSS).
2. Nested boxes for H/V/TAB/STACK + leaf units; keyboard driven.
3. Layers: focus, selection (magenta), merge tags (cyan).
4. Ops: move L/R/U/D, peel/move-out (Model B toggle vs reparent), move-in, group,
   ungroup, elevate parent, clear; optional multi-tag + commit merge.
5. Presets for tall-tab|term mon and nested cases; op log on screen.
6. Toggles for open decisions D1–D5 from the plan.
7. Short `docs/dev/prototypes/README.md` how to open (`file://` or local server).

## Out of scope

- Shell / extension code changes
- Locking D1–D9 (MD2 operator session after this ships)

## Session note

(ready — not started)
