# forge-nest-mark2-invoke — Nest/e2e Mark 2 action invoke

**Status:** accepted — **N1–N3 done** (N4 optional)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-29
**Depends on:** none for MVP (calls existing `CommandHandler` /
`extWm.command`); grows with sibling Mark 2 wiring plans
**Audit:** [forge-firm-abstractions/explore/08-tom-sole-source-audit.md](./forge-firm-abstractions/explore/08-tom-sole-source-audit.md)

## Goal

Nested Wayland and agent live tests invoke **kernel action ids** (and
later mapped DnD intents) **without Super+key**. One obvious entry:
`forge-test` / DBus / nest exec helper → `command({ name, … })` with
optional window selector/focus. Default nest smokes must not require
keystroke simulation for Mark 2 coverage.

## Acceptance

- [x] Documented invoke path works inside `forge-test nested exec/run`
      for at least `move.*` / `join.*` / `toggleSplit` / `promote` /
      `focus.*` (whatever CommandHandler already wires).
- [x] Optional focus/selector so nest does not depend only on ambient
      focus Meta.
- [x] One nest smoke (or unit+nest doctor) proves invoke without
      `--dispatch-mode=keybinding`.
- [x] Does **not** invent a second action vocabulary (use `ACTIONS` /
      Mark 2 ids).

## Implementation slices

| Slice | What | Status |
| --- | --- | --- |
| **N1** | Discover existing e2e `invoke_forge_action` / bridge; expose or wrap for nest CLI (`forge-test nested …` or `forge` test-only) | **done** |
| **N2** | Selector/focus helper (windowId / wmClass / title substring) before `command` | **done** |
| **N3** | Nest smoke: open two apps → invoke `move.left` / `join.right` → assert `forge tree` | **done** |
| **N4** | Later: DnD-as-action ids (sibling [DnD plan](./archived/completed/forge-dnd-mark2-complete.md) complete; nest `dnd-drop` already `_commitResolvedDrop`) | optional |

## Out of scope

- Wiring leftover Split handlers (sibling one-tiles plan)
- Peeling Meta / live Forest cutover
- Replacing personal layout profiles; use `_forge-test-*` only

## Context for the next agent

- **Invoke:** `./scripts/forge/forge-test nested invoke join.right --hint leftmost --activate`
  (nest must be up). Wraps e2e `invokeForgeAction`: Shell.Eval →
  `ext.extWm.command({name})`. Optional DBus `Focus` first.
- Selectors: `--selector` (product `id:` / `class:` / `title~=`),
  `--window-id`, `--class` / `--title` substring, `--hint leftmost|…`,
  `--activate`.
- **Not** product `forge Move` (dest-reparent). Bare `move` is rejected.
- **Smoke:** `./scripts/forge/forge-test nested run -- python3 ./scripts/forge/nest_mark2_smoke.py`
  or `./scripts/forge/forge-test nested smoke-mark2` (always stops).
  Proven 2026-08-29: two nautilus → `join.right` → CON HSPLIT→VSPLIT.
- Code: `scripts/forge/nest_invoke.py`, `scripts/forge/nest_mark2_smoke.py`.
- Units: `tests/unit/cli/test_nest_invoke.py`. Docs: `agents/testing.md`.
- N4 still optional (DnD-as-action ids). D4 deleted
  `_executeDropOperation`; nest `dnd-drop` already hits
  `_commitResolvedDrop` (session `_dndDropOp`, not `command({name})`).
  Kernel action ids for zones remain N4. Stop nest after campaigns.

## Session note

N1–N3 shipped on master (no commit). Nest **stopped**. CLI-only; no
extension JS / no `./install --dev`. D4 deleted `_executeDropOperation`;
N4 still optional (DnD is a surface, not a kernel action id).
