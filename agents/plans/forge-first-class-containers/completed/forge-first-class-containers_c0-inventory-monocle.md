# forge-first-class-containers_c0-inventory-monocle

**Status:** done (A/B AGREE)  
**Plan:** [forge-first-class-containers.md](../forge-first-class-containers.md)  
**Branch:** `plan/forge-first-class-containers`  
**Wave:** **C0**

## Goal

Kill workspace monocle (REG-monocle, REG-i3-super-m), inventory lossy layout
paths for later C slices, and sketch non-destructive `setLayout` + layout-unit
helpers so C1/R1 have a spine to hang on.

## Acceptance

1. **Monocle removed (no BC shims):**
   - Delete `toggleWorkspaceMonocle` and all call sites (`WorkspaceMonocleToggle`
     command, keybind wiring, schema key if safe to drop, settings-keys entry).
   - Unbind i3 kit `Super+m` (`workspace-monocle-toggle` → `[]` in all kits that
     still map it; prefer removing the key entirely from presets if the schema
     key is gone).
   - User/docs/README: remove monocle as a product feature; note zoom later if
     already mentioned in DESIGN.
   - Delete monocle-only tests (`bug-wf49-monocle-heuristic`, monocle command
     tests, keybind list entries that only assert the monocle key exists).
   - gschema / keybindings.schema.json: drop or stop shipping
     `workspace-monocle-toggle` (clean break — no dead keys).

2. **REG table updated** in the plan:
   - Mark REG-monocle and REG-i3-super-m as **dropped** (note in registry).
   - Kit impact summary reflects unbound Super+m / command removed.

3. **Lossy-path inventory** (doc under plan, not code comments essay):
   - File: `agents/plans/forge-first-class-containers/c0-lossy-inventory.md`
   - List call sites that reparent/flatten/hard-reset percents on layout toggle
     or “ensure” (tab↔split, stack↔tab lossy paths, `resetLayoutSingleChild`,
     `auto-exit-tabbed`, merge/ensure flatten, thrash paths).
   - Tag each with likely wave (C1 / C2 / C5) and whether it violates I1/I2.

4. **Unit helper sketch (minimal code, not full C1):**
   - Introduce a small pure or WM-adjacent surface for “layout unit” and/or
     `setLayout(con, layout)` that **documents I1** (mode change only; no
     reparent). Prefer extract under `lib/extension/` if a real hook exists;
     otherwise a clearly named stub/helper used by one existing path is enough.
   - Do **not** rewrite all toggles to non-destructive yet — that is C1.
   - Prefer wiring one call site (e.g. `LayoutStackTabToggle` or
     `applyDefaultLayoutToContainer`) through the helper if cheap; else export
     + unit test the helper’s contract only.

5. **Tests green:** `npm test` / `make unit-test` (or project’s usual unit
   suite) passes after monocle deletion.

6. **No residue:** no monocle stubs “for later zoom,” no `# if monocle`
   dead branches, no temp files.

## Non-goals

- Full non-destructive layout cycle (C1)
- Owning-split resize (R1)
- group/ungroup (C2), chrome (C3), focus parent (C4)
- Zoom implementation

## Session note

**C0 done** — A implement + B **AGREE**. Branch `plan/forge-first-class-containers`.

### Shipped
- Monocle fully removed (window/command/keybinds/schema/presets/docs/tests/e2e).
- REG-monocle + REG-i3-super-m **DROPPED at C0**.
- Inventory: `agents/plans/forge-first-class-containers/c0-lossy-inventory.md` (L1–L19).
- `lib/extension/layout-unit.js` (`setLayout` / I1); `LayoutStackTabToggle` wired;
  `tests/unit/extension/layout-unit.test.js`.
- `po/forge.pot` regenerated (no monocle string).

### Tests
`npm test` → **186 files, 1953 tests passed** (A and B).

### Next-agent bullets
- **C1:** non-destructive layout transitions — L5/L6, L1/L2, L7 via `setLayout`; no silent flatten.
- Do not re-add monocle mid-wave (REG restore policy).

---
