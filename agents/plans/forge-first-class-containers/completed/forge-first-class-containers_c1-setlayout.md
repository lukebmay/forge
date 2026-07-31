# forge-first-class-containers_c1-setlayout

**Status:** done (A/B AGREE)  
**Plan:** [forge-first-class-containers.md](../forge-first-class-containers.md)  
**Branch:** `plan/forge-first-class-containers`  
**Wave:** **C1**  
**Depends:** C0 done (layout-unit spine + inventory)

## Goal

Non-destructive layout transitions: changing H/V/tab/stack mode keeps the same
child **node identity** (invariant **I1**). No silent flatten of nested CONs;
no percent wipe as a side effect of a mere mode change.

Reference inventory: [c0-lossy-inventory.md](../plans/forge-first-class-containers/c0-lossy-inventory.md).

## Acceptance

1. **I1 tests (required):** unit tests prove that cycling or setting layout modes
   on a CON with nested CON children keeps child node ids/structure; percents
   are not hard-reset solely because layout mode changed (unless an explicit
   equalize/reset op is used).

2. **Keybind toggles L1/L2 use `setLayout`:**
   - `LayoutTabbedToggle` / `LayoutStackedToggle` change mode via
     `setLayout` from `layout-unit.js`.
   - Exiting tab/stack → split does **not** call `resetSiblingPercent` as a
     mode-change side effect.
   - MONITOR force-split (when focus parent is MONITOR) may still invent a CON
     so a layout mode has a home — that structure invent is OK; once on a CON,
     mode changes stay non-destructive. Prefer reusing existing split-if-monitor
     pattern without percent wipe on the new CON's later toggles.

3. **Session `_layoutOp` / cycle (L5/L6/L7):**
   - Absolute `layout` mode set must **not** call `_flattenLayoutParentToWindows`
     for H/V → tab/stack (or any mode change). Nested CONs stay nested.
   - `_layoutCycleOp` split-axis mode flip must not `resetSiblingPercent` solely
     for mode change.
   - If any call path still needs flatten, it must be an **explicit** op name
     (ungroup / future C2), not implicit inside layout set. Prefer delete the
     silent flatten from layout set entirely this slice.

4. **REG updates:** mark REG-lossy-tab-toggle progress in plan (dropped silent
   flatten on layout set / toggle). Note REG-auto-exit-tabbed still deferred
   (L8/L9 out of C1 unless trivial).

5. **LayoutToggle (H↔V)** goes through `setLayout` if not already.

6. **`npm test` green.** Purposeful I1 tests only — no trivia.

7. **Docs:** brief user note if toggle behavior changed (percents preserved);
   no monocle reintro.

## Non-goals

- Explicit `group` / `ungroup` commands (C2) — except removing silent flatten
  from layout set (that is C1).
- `auto-exit-tabbed` / `resetLayoutSingleChild` policy rewrite (C1–C2 later).
- Owning-split resize (R1).
- Chrome / focus parent (C3/C4).

## Session note

**C1 done** — A implement + B **AGREE**. Branch `plan/forge-first-class-containers`.

### Shipped
- All layout toggles + session `_layoutOp` / `_layoutCycleOp` via `setLayout` (I1).
- No silent flatten / percent wipe on mode change; MONITOR force-split kept.
- I1 tests (layout-unit, command, session cycle, inverted TZ flatten).
- Docs: layouts.md + DESIGN thrash note; REG-lossy-tab-toggle **C1 DONE**.

### Tests
`npm test` → 186 files / **1957** passed (A and B).

### Next-agent bullets
- **C2** explicit group/ungroup (wire `_flattenLayoutParentToWindows` only there).
- **R1** owning-split resize can interleave after units are stable.

---
