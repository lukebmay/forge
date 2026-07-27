# Workon: morning layout profiles

`forge workon` applies a **named layout profile** so your desk looks the same
each morning. It is **not** the shellrc `workon` command (shellrc owns `t`/`e`
and other domains) — always use **`forge workon`**.

Default behavior is **idempotent reconcile**: reuse windows that already match
roles, open only gaps, park extras. Running twice should not double apps.

## Quick start

```bash
# Point at shellrc host profiles (multi-machine tree)
export FORGE_WORKON_DIR=$shellrc/configs/forge/workon
# optional: export FORGE_HOST=black

forge workon list
forge workon show dev
forge workon dev --dry-run     # print plan only
forge workon dev               # apply
```

Without `FORGE_WORKON_DIR`, only `FORGE_WORKON_PATH` (if set) and
`~/.config/forge/workon/<name>.json` are searched.

## Commands

| Command | What it does |
| --- | --- |
| `forge workon list` | Human lines on stderr (name, source, host, short path); JSON array on **stdout** |
| `forge workon show <name>` | Header + validated profile JSON |
| `forge workon <name> --dry-run` | Print counts + plan JSON; **no** launches or tree mutations |
| `forge workon <name>` | Apply (reconcile or steps) |
| `forge workon <name> --force-launch` | Escape hatch: run imperative `steps[]` only (errors if none) |

Dry-run / apply / show share a header on stderr:

```text
forge workon: host=black profile=dev source=host path=…/hosts/black/dev.json
  reused  6   opened  0   moved  1   parked  2
  ok
```

Already perfect:

```text
forge workon: nothing to do (6 roles satisfied)
```

## Reconcile vs steps

| Schema | Behavior |
| --- | --- |
| **v2 reconcile** (`roles` + layout, or `mode: "reconcile"`) | Snapshot tree → match roles → open gaps, move/park; second run ≈ no-op |
| **v1 steps** (`version: 1` / `mode: "steps"` / `steps[]` without roles) | Replay launch + focus/layout ops (can double apps) |
| **`--force-launch`** | Force the steps path even on a dual profile |

Prefer **v2 reconcile** for daily use. Keep `steps[]` for debug scripts or when
you deliberately want a one-shot launch sequence.

Examples in-tree: `scripts/forge/examples/workon-dev-v2.json` (reconcile),
`workon-dev.json` (steps).

## Where profiles live

Search order (**first hit wins**):

```text
1. FORGE_WORKON_PATH                         # stem must match name
2. $FORGE_WORKON_DIR/hosts/<host>/<name>.json
3. $FORGE_WORKON_DIR/hosts/<host>/<name>/profile.json
4. $FORGE_WORKON_DIR/common/<name>.json
5. ~/.config/forge/workon/<name>.json        # XDG
```

| Env | Role |
| --- | --- |
| `FORGE_WORKON_DIR` | Root of the shellrc-style tree (`hosts/`, `common/`) |
| `FORGE_HOST` | Override short hostname (else `hostname` without domain) |
| `FORGE_WORKON_PATH` | One-shot absolute profile path |

Typical shellrc layout:

```text
$shellrc/configs/forge/workon/
  hosts/
    black/dev.json
  common/
    …
```

Forge does **not** hardcode shellrc paths — export `FORGE_WORKON_DIR` from your
shell init when you want host profiles.

## Tips

- Always dry-run a new profile: `forge workon dev --dry-run`.
- Chrome / PWA matching is title-sensitive; tweak `match` if the wrong window
  is claimed (see profile comments / shellrc README).
- Optional profile fields: `displays` (runs `gdisplays load`), `settings`
  (DBus SettingsLoad).
- Offline plan tests: `--tree-file path/to/GetTree.json` with `--dry-run`.

More detail: [scripts/forge/README.md](../../scripts/forge/README.md),
design notes in [DESIGN.md](../DESIGN.md).
