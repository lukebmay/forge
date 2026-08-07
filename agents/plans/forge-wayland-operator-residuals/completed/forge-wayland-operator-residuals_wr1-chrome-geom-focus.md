# Task: WR1 — Chrome geom stick + focus thrash (Wayland)

**Status:** done (A/B AGREE)  
**Plan:** [forge-wayland-operator-residuals](../forge-wayland-operator-residuals.md)  
**Branch:** `plan/forge-wayland-operator-residuals`  
**Created:** 2026-08-06  
**Completed:** 2026-08-06  

## Problem

Operator on Wayland after `forge layout dev` / focus walk:

1. Left mon tab group often does not **show Grok** (profile `active: Grok`) as the open leaf at full size.
2. Changing focus (tab click or app click) **flickers** Chrome PWAs (Gmail, YouTube, …).
3. After focusing Grok then another mon’s tab, **Grok stuck at ~¼ monitor height** with Chrome visible behind.
4. Journal: `layout-controller: verify mismatch give-up after 10 … rect-mismatch` for Grok and siblings.

## Acceptance (met)

1. No stuck ¼ height — pure rect-mismatch targeted reassert; give-up force reassert + recovery verify.
2. No focus flicker storm — open-leaf-only reassert; buried tabs skip move_resize.
3. Open-leaf reassert on focus + raise; layout profile `active: Grok` still CLI residual; geom recover better.
4. Unit tests for regression.
5. vitest window+extension 975 green.
6. No `renderTree("focus")` reintroduced.

## Session note

**2026-08-06 A/B AGREE:**

### Root causes
1. Focus reassert moved all off-slot tab siblings → buried Chrome flicker.
2. Verify mismatch always full renderTree for pure rect-mismatch → give-up stuck undersize.
3. Off-mon focus left open leaf unrecovered after give-up.

### Shipped
- `focus.js`: open-leaf-only reassert (mode all/force optional)
- `window.js`: `move({ force })`, `reassertNodeToSlot`, `reassertTilesByIds`
- `layout-controller.js`: pure rect → targeted reassert; give-up force path

### Operator next
Install + Wayland logout; `forge layout dev`; focus walk; confirm no ¼ stick / flicker.
