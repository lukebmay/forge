# forge-first-class-containers_c2-group-ungroup

**Status:** done (A/B AGREE + live black)  
**Plan:** [forge-first-class-containers.md](../plans/forge-first-class-containers.md)  
**Branch:** `plan/forge-first-class-containers`  
**Wave:** **C2**  
**Depends:** C0–C1 + R1 done

## Goal

Explicit **group** / **ungroup** as the only structure ops that invent or dissolve
user CONs (invariant **I2**). Layout mode changes stay non-destructive (I1).

Reference: [c0-lossy-inventory.md](../plans/forge-first-class-containers/c0-lossy-inventory.md)
L6 / L11 / L18; plan commands table (`group` / `ungroup`).

## Acceptance

### 1. Ungroup (required)

1. **Semantics (one-level dissolve):** Given focus on a tiled WINDOW (or inside a
   bag), resolve **target CON** = nearest parent that is `NODE_TYPES.CON` and is
   **not** MONITOR/WORKSPACE/ROOT. **Ungroup** moves that CON’s children up into
   the grandparent (in order, at the CON’s index), removes the empty CON, and
   normalizes sibling percents on the grandparent. Nested CON *children* stay
   CONs (one level only — not deep peel-to-windows unless a separate path).
2. **No-op** when there is no dissolve target (e.g. window’s only structural
   parent is MONITOR with no intermediate CON).
3. Prefer pure-ish helpers where practical (e.g. resolve ungroup target in
   `layout-unit.js` or small pure module) + tree mutation on `Tree` (e.g.
   `ungroupContainer(con)`). Reuse tab reparent cleanup patterns from
   `_flattenLayoutParentToWindows` / existing reparent (tab reset) if needed.
4. **Command:** `WindowUngroup` (or `ConUngroup`) in `command.js`.
5. **Schema key:** `window-ungroup` (or `con-ungroup`) in gschema +
   `settings-keys.js` + `config/keybindings.schema.json`.
6. **Presets:** Safe + Vim unbound by default **or** a sensible free chord that
   does not collide (document). i3 kit may stay unbound this slice — C5 kits OK.
7. **Keybindings map** wires the key → command.
8. **RunSteps / CLI:** `ungroup` op in `EXTENSION_OPS` (`run-steps.js` +
   `scripts/forge/layout_lib.py` + help strings in `scripts/forge/forge`).
   SessionApi handler dispatches real ungroup. Prefer `selector: focus` default.

### 2. Group (required — formalize existing merge)

1. Keep **`WindowMergeGroup` / `mergeWindowsIntoGroup`** as the explicit **group**
   path (two windows → tabbed CON default). Do not invent a second merge stack.
2. Add RunSteps alias **`group`** → same handler as `merge-group` (or document
   `merge-group` as the only name and add `group` if cheap — prefer **both**
   names accepted for plan surface).
3. No silent group invent on layout toggle (already C1).

### 3. I2 tests (required)

1. Unit tests prove:
   - `setLayout` / layout cycle does **not** dissolve nested CONs (I1 residual).
   - **ungroup** dissolves exactly one CON level; child node ids preserved as
     grandparent children; nested CON child remains CON.
   - ungroup no-op when no CON target.
   - group/merge creates CON only via explicit merge (existing tests OK; extend
     if needed).
2. **`_flattenLayoutParentToWindows`:** either delete if unused, or call **only**
   from explicit ungroup/deep-flatten paths — **not** from layout set. Prefer
   one-level `ungroupContainer` as primary; deep flatten only if a test/API
   needs it and is named explicitly.

### 4. Silent invent / REG (required notes)

1. **REG-auto-exit-tabbed (L8/L9):** Evaluate. **Default for this slice:** keep
   `auto-exit-tabbed` / `resetLayoutSingleChild` as **mode-only** single-child
   chrome cleanup (TABBED/STACKED → split layout; does **not** dissolve the CON).
   Note in plan REG table. Do **not** rewrite close/move epilogues unless a
   clear I2 violation (reparent flatten) is found — then stop for design if
   large.
2. **L11/L18** remain explicit group (OK for I2).
3. Update inventory rows L6/L18 as C2 done where applicable.
4. Update plan session note + REG table; brief user docs for ungroup key/CLI.

### 5. Quality bar

1. **`npm test` green.** Purposeful I2 tests only.
2. No monocle reintro; no zoom/float.
3. Residue-free (no debug leftovers).

## Non-goals

- C3 split chrome / C4 focus parent / move-in-out
- R2 prefs Size rename; edge/mouse resize residual
- Full kill of `auto-exit-tabbed` setting UI
- Deep “flatten entire workspace to windows” as default ungroup

## Live verify (orchestrator / after A/B)

On black after install: merge two tiles → tab group; ungroup → both siblings under
split/monitor again; layout toggle still does not dissolve nest. **Do not kill
Ghostty windows.** HUP OK if needed after `./install`.

## Session note

**C2 done** — A implement + B **AGREE** + live black. Branch
`plan/forge-first-class-containers`.

### Shipped
- **Pure:** `resolveUngroupTarget` / `isUngroupCon` in `layout-unit.js`
- **Tree:** `ungroupContainer(con)` — one-level dissolve + `resetSiblingPercent`
- **Command:** `WindowUngroup`; key `window-ungroup` → `Ctrl+Shift+Super+m`
  (Safe/Vim/i3 + gschema default)
- **RunSteps/CLI:** ops `ungroup`, `group` (alias of `merge-group`); SessionApi
  `_ungroupOp`; layout_lib + forge help
- **Deleted:** unused `_flattenLayoutParentToWindows` (deep peel)
- **REG-auto-exit-tabbed:** kept mode-only (no CON dissolve) — noted in plan
- **Docs:** layouts.md, troubleshooting, keybindings tables; inventory L6+

### Live (black, Ghostty kept)
- Nested TABBED ungroup → one-level lift (I2); second ungroup → flat under mon
- mon1 layout-cycle group TABBED→STACKED kept 3 kids (I1)
- `npm test` 187 / 1984; install + HUP OK

### Next
**C3** split chrome (focus ancestry + show-all + drag show-all)
- Existing I1 layout-set tests still apply (no flatten)

### Residual risks
- Live tab decoration after ungroup (unit mocks skip St actors)
- Multi-level nest needs multiple ungroup presses (by design)
- Kits re-apply needed on existing dconf installs for new chord

### Next for B
- Review reparent order + tab reset; re-run `npm test`
- Confirm no layout path calls dissolve; presets cover KEYBINDING_KEYS
