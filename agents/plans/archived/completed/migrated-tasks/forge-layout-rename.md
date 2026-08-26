# Task: Rename `workon` → `layout` (no BC)

**Pri:** P1 after mon-order fix  
**Status:** Done — A/B AGREE; committed in wrap-up
**No backwards compatibility** — pre-release; delete old names.

## Product names

| Old | New |
| --- | --- |
| `forge workon` | `forge layout` |
| `forge workon capture` | `forge layout save [name]` |
| `FORGE_WORKON_DIR` / `PATH` | `FORGE_LAYOUT_DIR` / `FORGE_LAYOUT_PATH` |
| `configs/forge/workon/` | `configs/forge/layout/` |
| `~/.config/forge/workon/` | `~/.config/forge/layout/` |
| modules `workon_*.py` | `layout_*.py` |
| docs `workon.md` | `layout.md` |
| tests `test_workon_*` / fixtures `workon/` | `test_layout_*` / `layout/` |

## CLI surface

```text
forge layout <name>           # apply reconcile
forge layout list | show | plan | help
forge layout save <name>      # snapshot tree → host profile file
forge layout save <name> --stdout   # optional: print JSON only (no write)
```

### `layout save <name>`

1. Capture tiles sugar from GetTree (existing capture logic).
2. **Write** to host path (not “redirect yourself” as primary UX):
   - If `FORGE_LAYOUT_DIR` set: `$FORGE_LAYOUT_DIR/hosts/<hostname>/<name>.json`
   - Else: `~/.config/forge/layout/hosts/<hostname>/<name>.json` (create dirs)
3. Print short human line: path + host + name.
4. Require `<name>` (or document default — prefer **require name**).
5. No `workon` / `capture` command aliases.

## Docs / tone

- Not “morning-only” — layouts are anytime named desks.
- Update README, docs/user, docs/DESIGN mentions of command name, scripts/forge/README, cli help.
- shellrc `configs/forge/layout/README.md` + `forge.zsh` env.
- Historical `agents/plans/forge-workon-*` plan **filenames** may stay; update PRIORITY / project active text to `layout`.

## Repos to touch

1. **forge** — CLI, modules, tests, docs, examples  
2. **shellrc** — `configs/forge/workon` → `layout`, `forge.zsh`, any refs  

## Acceptance

1. `forge workon` → unknown command (or help points to layout only if main help lists commands).
2. `forge layout list` / `show dev` / `dev --dry-run` work with shellrc host profile.
3. `forge layout save dev` writes under `…/layout/hosts/black/dev.json` when FORGE_LAYOUT_DIR set.
4. Unit tests renamed and green.
5. Docs have no primary `forge workon` UX; no “morning-only” framing as the product purpose.
6. shellrc env exports `FORGE_LAYOUT_DIR`.


## Session note

Shipped rename workon→layout, mon+tab ensure_order, compact save, flat cell sugar.
Next: [forge-layout-sugar.md](../plans/forge-layout-sugar.md) bare-array + app inference.
