# forge-container-selection — S3 kit bindings + cheatsheet

**Status:** ready  
**Plan:** [forge-container-selection.md](../plans/forge-container-selection.md)  
**Branch:** `plan/forge-first-class-containers`  
**Depends on:** S2 done (elevated ops matrix)

## Goal

Bind discoverable chords for focus-parent / clear (and optional focus-child) per
S0 kit table; document in cheatsheet + user docs. Conflict-scan Super+p and
BackSpace family before ship.

## Acceptance

1. **Vim:** focus-parent **`Super+p`** (candidate; conflict-scan).  
2. **Vim:** clear selection — **BackSpace family multi-bind** (Super / Shift+Super /
   Ctrl+Super / Ctrl+Shift+Super + BackSpace) so operator can try; trim later.  
3. **i3:** keep focus-parent **`Super+a`**; clear same family or subset.  
4. **Safe:** optional parent bind or unbound until QA (S0).  
5. **focus-child** chord TBD after conflict scan (`Super+n` vs `Super+.`).  
6. Cheatsheet + `docs/user/` reflect parent / clear / selection chrome.  
7. move-in / move-out stay **unbound** v1 (CLI ok).  
8. Unit/schema tests for kit default arrays where project already tests kits.  
9. No nested-tab product push (S4). No selection mode v2.

## Out of scope

- S4 nested tabs product  
- S5 full live QA matrix (operator; partial smoke OK)  
- Zoom / mouse residual  

## Handoff pointers

- Schema: `window-focus-parent`, `window-selection-clear`, `window-focus-child`  
- Kits: keybinding defaults (Safe / Vim / i3)  
- Plan S0 kit table + rejected chords  
- S1 clear API already unbound; S2 ops honor elevated target  

## Session note (overwrite)

Ready after S2. Implement next.
