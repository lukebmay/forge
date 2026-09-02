# P1c — Shared Super-bearing Mark 2 keybind table

**Status:** done (D081 kit content)
**Updated:** 2026-08-27
**Implementer:** Grok 4.6
**Brake:** `cd prototypes/container-motion && npm test` → **ALL PASSED
(154 cases)**
`npx vitest run tests/unit/keybinds/mark2-table.test.js` → **9 passed**
**Lock:** [`keybinds.md`](./keybinds.md) · D080 · D081

## Goal

One gi-free table: **action id → Super-bearing chord**. Proto =
`stripSuper(table) ∪ protoOverlay`. The table **is** the Forge Mark 2
kit (GNOME accels). Do not keep a second hand-written proto chord list.

## Landed

1. **`lib/keybinds/package.json`** `{ "type": "module" }`
2. **`lib/keybinds/strip-super.js`** — GNOME accel → proto chord; drop
   Super/Meta; `Left` → `ArrowLeft`; `Return` stays `Return`.
3. **`lib/keybinds/actions.js`** — frozen dotted ids + labels.
4. **`lib/keybinds/mark2.js`** — Super-bearing table (`focus.*`,
   `move.*`, `join.*`, toggles, promote, size). `join.left` =
   `<Ctrl><Super>h` (Join chord; shipping vim kit still swap).
5. **`lib/keybinds/proto-overlay.js`** — proto-only: `a` launch, `q` /
   Backspace `remove`, `t` / Escape tags, `Delete` destroy, `f` flatten,
   `y/u/i/o` extra focus (`focus:left` aliases so they do not enlarge
   table `focus.left` chords).
6. **Proto `keybinds.mjs`** — `defaultVimMinusSuper()` **generated**
   from `stripSuper(MARK2_TABLE) ∪ PROTO_OVERLAY`. Shared ids on table
   rows (`move.left`, not `opset:move:left`).
7. **`main.mjs` `runAction`** — dotted ids (`move.left` → Mark 2 move,
   `join.left` → join, `focus.left`, `toggleSplit`, `remove`, `size.*`).
   Aliases kept: `opset:move:left`, `focus:left`, `opset:join:left`,
   `opset:remove`, `size:x:-`. Migration block left in place.
8. **Tests**
   - Vitest `tests/unit/keybinds/mark2-table.test.js` (7): stripSuper
     examples; every table id has an accel; proto generated chords ≡
     `stripSuper(table)` per shared id; overlay `a`/`q` not in core.
   - Proto `test/cases-keybinds.mjs` (9): Move/Join, `p`/`Shift+p`,
     `m`/`n`, `[`/`]`, no yuio extra-focus, overlay `a`/`q`.

**Did not edit:** `lib/shared/keybind-presets.js`, `settings-keys.js`,
`command.js`, `tree.js`, `window.js`.

**D081:** proto right-hand reach **is** the vim kit. Overlay is
`a`/`q`/Delete/tags/`f` only.

## Remaining (not this slice)

- **P2** — strip `decisions` / `mergeTags`
- P4/P6 — apply table to shipping vim kit (Join vs swap; Super+p parent)
- Forge CommandHandler dispatch of shared ids
