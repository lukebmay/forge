# Workon: morning layout profiles

`forge workon` applies a **named layout profile** so your desk looks the same
each morning. It is **not** the shellrc `workon` command (shellrc owns `t`/`e`
and other domains) — always use **`forge workon`**.

Default behavior is **idempotent reconcile**: reuse windows that already match
roles, open only gaps, park extras. Running twice should not double apps.

**Forge is app-agnostic.** Roles, match rules, and layout live only in your
JSON (shellrc host tree or `~/.config/forge/workon/`). Nothing in the extension
or CLI hardcodes Ghostty, Chrome, hostnames, or a “dev” desk.

Interactive guide (colorized):

```bash
forge workon help
forge help            # acronyms (LFT, …) + all commands
```

## Quick start

```bash
# Point at shellrc host profiles (multi-machine tree)
export FORGE_WORKON_DIR=$shellrc/configs/forge/workon
# optional: export FORGE_HOST=$(hostname -s)

forge workon list
forge workon show mydesk
forge workon mydesk --dry-run     # print plan only
forge workon mydesk               # apply
```

Without `FORGE_WORKON_DIR`, only `FORGE_WORKON_PATH` (if set) and
`~/.config/forge/workon/<name>.json` are searched.

## Commands

| Command | What it does |
| --- | --- |
| `forge workon help` | Colorized guide, defaults, minimal example |
| `forge workon list` | Human lines on stderr; JSON array on **stdout** |
| `forge workon show <name>` | Header + validated profile JSON |
| `forge workon <name> --dry-run` | Plan only; **no** launches or tree mutations |
| `forge workon <name>` | Apply (reconcile or steps) |
| `forge workon <name> --force-launch` | Imperative `steps[]` only (errors if none) |

## Minimal profile

Drop this at `~/.config/forge/workon/simple.json` (edit class/app names):

```json
{
  "roles": [
    { "id": "browser", "match": "Firefox", "open": "firefox" },
    { "id": "term", "match": "com.mitchellh.ghostty", "open": "ghostty" }
  ],
  "layout": {
    "mon0": {
      "children": [
        { "id": "main", "roles": ["browser"] },
        { "roles": ["term"] }
      ]
    }
  }
}
```

Then `forge workon simple --dry-run` → `forge workon simple`.

### Defaults (omit noise)

| Omitted field | Default |
| --- | --- |
| `version` | `2` when `roles[]` present |
| `mode` | `reconcile` when `roles[]` present |
| `match: "WmClass"` | `{ "class": "WmClass" }` |
| `open: "app"` | `{ "app": "app" }` |
| `class` / `app` on role | fill `match` / `open` if those keys missing |
| `layout.monN.split` | `hsplit` when ≥2 children |
| child `layout` | `tabbed` when ≥2 roles in that pane |
| child `id` | sole role id when `roles: ["one"]` |
| role `slot` | from `layout` `roles:[]` listing |
| `overflow` | `mon0.overflow` + `tabbed` |

## Reconcile vs steps

| Schema | Behavior |
| --- | --- |
| **v2 reconcile** (`roles` + layout) | Snapshot tree → match roles → open gaps, move/park; second run ≈ no-op |
| **v1 steps** (`version: 1` / `mode: "steps"` / `steps[]` without roles) | Replay launch + focus/layout ops (can double apps) |
| **`--force-launch`** | Force the steps path even on a dual profile |

Prefer **v2 reconcile** for daily use.

Examples in-tree:

- `scripts/forge/examples/workon-minimal.json` — short generic sample  
- `scripts/forge/examples/workon-dev-v2.json` — richer dual-mon sample (edit apps)

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

Forge does **not** hardcode shellrc paths — export `FORGE_WORKON_DIR` from your
shell init when you want host profiles.

## Tips

- Always dry-run a new profile: `forge workon <name> --dry-run`.
- Title matchers (`title~=`) disambiguate several windows of the same class.
- Optional: `displays` → `gdisplays load`; `settings` → DBus SettingsLoad.
- Offline plan: `--tree-file path/to/GetTree.json` with `--dry-run`.
- Help color: `forge --color=always workon help` (or `never` / `auto`).

More: [scripts/forge/README.md](../../scripts/forge/README.md),
[DESIGN.md](../DESIGN.md).
