# forge-nested-isolation_n1-data-root — Nest FORGE_HOST + CLI data roots

**Status:** done  
**Plan:** [forge-nested-isolation](../../forge-nested-isolation.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends on:** N3 done (cleanup shipped)

## Goal

Treat nest as a **separate logical host** for CLI forge mutators:

- `FORGE_HOST=<hostname>-sub-<nestname>` (e.g. `black-sub-forge`)
- Nest-scoped config/state dirs so settle-heuristics / windows paths used by
  **CLI** do not rewrite parent `~/.config/forge`

## Acceptance

- [x] Nest client env (env/export/exec/run) sets `FORGE_HOST` and forge config
      root env vars (define one clear contract, e.g. `FORGE_CONFIG_HOME` or
      documented `XDG_CONFIG_HOME` under nest state)
- [x] CLI settle + layout host resolution uses nest host id when set
- [x] Unit: path helpers + env merge; parent heuristics path ≠ nest path
- [x] Live (optional): nest layout smoke does not change parent
      `settle-heuristics.json` mtime/content for parent host key
- [x] Layout **profiles** still resolve from shared `layout/` / `FORGE_LAYOUT_DIR`
      (fixtures shared; timings not)

## Context for the next agent

- **Contract (N1 CLI):**
  - `FORGE_HOST=<short-hostname>-sub-<nestname>` (e.g. `black-sub-forge`)
  - `FORGE_CONFIG_HOME=<session_dir>/forge-config`  # analogue of `~/.config/forge`
  - Heuristics path: `$FORGE_CONFIG_HOME/config/settle-heuristics.json`
  - Layout profiles: **not** redirected — still `FORGE_LAYOUT_DIR` or parent
    `~/.config/forge/layout` (shared fixtures)
- **Code:**
  - `nested_wayland.py`: `nest_forge_host`, `nest_forge_config_home`,
    `ensure_nest_cli_dirs`, `client_env` / `merge_client_env` / `env.sh`
  - `settle_heuristics.py`: `resolve_config_root` / `config_dir` /
    `heuristics_path` honor `FORGE_CONFIG_HOME`
  - `keybind_kit.profiles_dir` honors `FORGE_CONFIG_HOME` when no
    `FORGE_KEYBIND_PROFILES_DIR`
  - `layout_lib`: host via `FORGE_HOST`; tree root stays shared (comment only)
- **Gap (N2):** extension/Shell still may write parent `~/.config/forge` via
  GLib user config dir — not isolated in N1
- Default mon=1 for smokes; `run` always stops (N3)

## Session note

**2026-08-10 N1 shipped (ready for review)**

**Env contract:**
| Key | Value |
| --- | --- |
| `FORGE_HOST` | `{hostname}-sub-{nestname}` |
| `FORGE_CONFIG_HOME` | `~/.local/state/forge/nested/<name>/forge-config` |

**Proven:**
```
python3 -m pytest tests/unit/cli/test_nested_wayland.py \
  tests/unit/cli/test_settle_heuristics.py \
  tests/unit/cli/test_layout_apply.py \
  tests/unit/cli/test_keybind_kit.py -q   # 174 passed
forge nested stop || true
forge nested run -- env | grep FORGE_
  # FORGE_HOST=black-sub-forge
  # FORGE_CONFIG_HOME=…/nested/forge/forge-config
forge nested status   # running: False, exit 1
# parent settle-heuristics.json mtime+md5 unchanged
```

**Residual:** N2 extension confDir / GLib isolation; N4 docs process rules.
