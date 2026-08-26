# WR2 — Workon profile path resolve (host / common / XDG)

**Plan:** [forge-workon-reconcile.md](../plans/forge-workon-reconcile.md)  
**Status:** Done (A/B AGREE)  
**Priority:** P1 product  
**Depends:** WR1 Done (planner pure; this is resolve only)

## Goal

Resolve workon profile files with **host-aware search order** (mirror gdisplays),
so `list` / `show` / future apply know which file won and why.

## Search order (first hit wins)

```text
1. FORGE_WORKON_PATH          # single file override (stem must == name + exists)
2. FORGE_WORKON_DIR / hosts/<host>/<name>.json
3. FORGE_WORKON_DIR / hosts/<host>/<name>/profile.json
4. FORGE_WORKON_DIR / common/<name>.json
5. ~/.config/forge/workon/<name>.json   # XDG / FC5 compat
```

No shellrc hardcode: when `FORGE_WORKON_DIR` unset, only PATH + XDG.

| Env | Role |
| --- | --- |
| `FORGE_WORKON_DIR` | Root of host/common tree |
| `FORGE_WORKON_PATH` | Exact file (optional; highest priority when stem matches) |
| `FORGE_HOST` | Hostname override (like `GDISPLAYS_HOST`) |

Default host: `FORGE_HOST` → `socket.gethostname()` short name (strip domain).

## Acceptance

1. Pure helpers (stdlib): resolve profile path for a name → `{path, source, host, …}`  
   Sources: `env-path` | `host` | `host-dir` | `common` | `xdg` | `not-found`.
2. `list_profiles_resolved`: enumerate env-dir hosts/common + XDG; each shows **source**.
3. Unit tests with temp dirs + env — no real shellrc required.
4. FC5 XDG-only still works when env unset (`list_profiles` / `profile_path` unchanged).
5. Invalid names still rejected (same name rules as today).
6. CLI: `forge workon list` / `show` print source + path. Run still XDG-only (WR3).

## Non-goals

- Planner changes (WR1)
- Apply / dry-run executor (WR3)
- Writing shellrc host files (WR4)
- Auto shellrc install snippet (WR9)

## Session note

**WR2 Done:** Host-aware resolve in `scripts/forge/workon_lib.py` —
`resolve_host`, `resolve_profile`, `list_profiles_resolved`. Sources
`env-path|host|host-dir|common|xdg|not-found`. `FORGE_WORKON_PATH` only wins
when file exists and stem == name. No shellrc hardcode.

CLI: `forge workon list` / `show` use resolved API (source/path/host).
`forge workon <name>` run still `profile_path` XDG (WR3 apply).

Tests: `tests/unit/cli/test_workon_resolve.py` (20) + workon_lib 23 + plan 23 green.

**Next edges for WR3/WR5:** run/apply should call `resolve_profile` not
`profile_path`; dry-run should report source; shellrc export of
`FORGE_WORKON_DIR` is WR9/docs.
