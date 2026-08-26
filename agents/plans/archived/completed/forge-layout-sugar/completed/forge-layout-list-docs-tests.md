# Task: layout list docs + tests (post list polish)

**Status:** done (A/B AGREE)  
**Plan:** [forge-layout-sugar.md](../../forge-layout-sugar.md) (follow-up; main LS* done)  
**Why:** Recent commits changed list resolve root and host-only table UX; docs/README still described old behavior.

## Shipped code (already on master before this task)

| Commit | Behavior |
| --- | --- |
| `db63c77` | `layout_tree_root`: list/resolve always scan `hosts/<host>/` + `common/` under `FORGE_LAYOUT_DIR` or `~/.config/forge/layout` (same as save) |
| `cf85caf` | `forge layout list` = **this host only**; human **Name + Description** table; JSON `[{name,description}]` when stdout piped |

## Acceptance

1. **Docs** match code — done (`docs/user/layout.md`, `scripts/forge/README.md`, root `README.md`, `docs/DESIGN.md` list UX)
2. **Tests** — `host_profiles_only`, `format_profile_list_table`, XDG hosts list without `FORGE_LAYOUT_DIR`
3. Unit tests green (58 in layout_lib + layout_resolve)
4. Session notes + PRIORITY

## Session note

**A:** docs + tests only. **B AGREE** (optional DESIGN.md nit fixed at commit).

| Area | Paths |
| --- | --- |
| User docs | `docs/user/layout.md` |
| Scripts README | `scripts/forge/README.md` |
| Root + DESIGN | `README.md`, `docs/DESIGN.md` |
| Tests | `tests/unit/cli/test_layout_lib.py`, `test_layout_resolve.py` |
