# forge-container-selection — S1 selection state + bag chrome

**Status:** ready  
**Plan:** [forge-container-selection.md](../plans/forge-container-selection.md)  
**Branch:** `plan/forge-first-class-containers` (or `plan/forge-container-selection` after containers→master merge)  
**Depends on:** S0 locked 2026-08-03  

## Goal

Make elevated container selection a real, visible ops target: durable state +
loud bag chrome. Focus border (user purple/red) always stays on the focused
window.

## Acceptance

1. **Ops target state** is explicit and queryable (build on `tree.attachNode` or
   thin wrapper): default = focused leaf; focus-parent elevates; focus-child
   descends; clear snaps to focused leaf.
2. **Meta focus change** to another window resets target to that window.
3. **Visual:** when target is an elevated CON (≠ focus leaf), paint a **full CON
   rect** border via new CSS class (e.g. `.window-selection-border`); stock color
   high-contrast vs focus (not purple/red reuse). When target = focus leaf, **no**
   selection border (no double paint).
4. Focus border / existing tiled border **unchanged** in meaning and paint path.
5. Bundled `stylesheet.css` + `docs/user/theming.md` document the new selector.
6. Unit tests for elevate / multi-parent / clear / focus-reset (pure or WM mock).
7. No kit binding work in S1 (that is S3); API/actions for clear may land stubbed
   if needed for tests.

## Out of scope (later slices)

- S2: move/swap honor elevated CON as unit  
- S3: Vim `Super+p`, BackSpace clear multi-bind, cheatsheet  
- S4 nested tabs product; selection mode v2  

## Session note (overwrite)

Ready after S0 design lock. Implement next.
