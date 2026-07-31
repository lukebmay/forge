# forge-first-class-containers_c5-kits-docs

**Status:** done (A/B AGREE) verify  
**Plan:** [forge-first-class-containers.md](../plans/forge-first-class-containers.md)  
**Branch:** `plan/forge-first-class-containers`  
**Wave:** **C5**  
**Depends:** C0–C4 + R1

## Goal

Close the containers primary wave: **kits, docs, DESIGN, REG table** match
shipped surface; strip residual lossy toggle paths if any remain after C1–C4;
smoke that keybind presets and CLI help list the new ops.

## Acceptance

1. **Keybind kits** (Safe / Vim / i3 in `keybind-presets.js` + docs tables):
   - Document all C2–C4 keys: ungroup, focus parent/child, move-in/out,
     split-chrome-show-all-toggle, merge-group. Unbound is OK if intentional —
     tables must not omit shipped keys.
   - i3: Super+a = focus parent (C4); Super+m stays free for zoom later
     (REG-i3-super-m); ungroup chord if set remains documented.
2. **CLI help** (`scripts/forge/forge` run-steps help): list `group`, `ungroup`,
   `focus-parent`, `focus-child`, `move-in`, `move-out` with one-line shapes.
3. **docs/DESIGN.md**: containers wave note current (I1–I3, I5 progress; group/
   ungroup; chrome; focus/move). No monocle resurrection.
4. **REG registry** in plan: all C0–C4 rows accurate; no stale “next C2” text.
5. **Inventory** `c0-lossy-inventory.md`: mark C5-resolved or deferred rows
   (L14 cleanTree, L16 mode-flag) with honest wave tags.
6. **Residual lossy strip:** grep for silent `_flatten` / layout-set reparent;
   if any accidental reintro, delete. Do not redesign thrash ensure.
7. **`npm test` green.** Docs-only OK without new tests if no code change;
   if kits/schema change, keep whitelist tests green.
8. Plan status: C5 **Done**; **next** optional R2 or Z0 discussion — not start
   zoom without plan lock.

## Non-goals

- Implement zoom (Z)
- R2 prefs rename unless one-line
- Optional SL6 / settle D0 / yuiop

## Session note

**C5 done** — A implement + B **AGREE**. Branch `plan/forge-first-class-containers`.

### Shipped
- CLI help + layout_lib EXTENSION_OPS sync with run-steps
- Keybindings/layouts/DESIGN/README: C2–C4 surface; i3 Super+a; Super+m free
- REG + inventory L14/L16 C5 keep; no residual `_flatten*`
- npm 2016 / 188; pytest cli 338

### Next
Containers primary wave **complete**. Optional R2 prefs rename or Z0 zoom lock
(do not auto-start zoom). Human: D0 settle lock if product priority.

