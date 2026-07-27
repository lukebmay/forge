# Workon: morning layout profiles

`forge workon` applies a **named layout profile** so your desk looks the same
each morning. It is **not** the shellrc `workon` command (shellrc owns `t`/`e`
and other domains) — always use **`forge workon`**.

Default behavior is **idempotent reconcile**: reuse windows that already match
roles, open only gaps, keep companions already in a workon slot, park true
residuals. Running twice should not double apps.

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
| `forge workon show <name>` | Header + validated (normalized) profile JSON |
| `forge workon capture` | Sketch **tiles** sugar from the live tree (stdout JSON) |
| `forge workon capture --tree-file F` | Offline capture from a GetTree forest file |
| `forge workon capture --out PATH` | Also write PATH (parent dir must already exist) |
| `forge workon <name> --dry-run` | Plan only; **no** launches or tree mutations |
| `forge workon <name>` | Apply (reconcile or steps) |
| `forge workon <name> --force-launch` | Imperative `steps[]` only (errors if none) |

## Capture (authoring assist)

Lay out the desk by hand once, then sketch a profile:

```bash
forge workon capture > ~/.config/forge/workon/mydesk.json
# or:
forge workon capture --out ~/.config/forge/workon/mydesk.json
forge workon mydesk --dry-run
```

| Detail | Behavior |
| --- | --- |
| Shape | Compact **`tiles` sugar** (mons → panes; tab groups as nested lists) |
| Match | Best-effort `class` + `title~=` when several windows share a class; main Chrome → `title~="Google Chrome"` when the title contains that product name |
| Open | Best-effort `{ "app": … }` from class stem — **edit** PWAs / argv |
| Floating | `floating: []` when none; float role-ish objects when cheap |
| Install | **Never** writes shellrc host profiles unless you pass **`--out`** |
| Counts | stderr one-liner: `mon0=… mon1=… windows=…` |

Capture is a **starting point**, not a perfect profile. Refine `match` /
`open` for Chrome PWAs, then dry-run.

## Authoring: compact `tiles` sugar (preferred)

Drop this at `~/.config/forge/workon/simple.json` (edit app names):

```json
{
  "tiles": {
    "mon0": [
      ["firefox", "code"],
      "ghostty"
    ]
  }
}
```

| Sugar | Meaning |
| --- | --- |
| `monN: [ a, b ]` | Two mon children; default **hsplit** |
| `["app1", "app2"]` | One pane, two roles, **tabbed** |
| `"ghostty"` | One pane, one role (no lonely tab chrome) |
| `"split": "h"` / `"v"` / `hsplit` / `vsplit` / `horizontal` / `vertical` | Override split |
| `{ "split", "content": […] }` | Nested split node |
| String cell | Role: `open` + best-effort `match`; id auto (de-dupe `app-2`) |
| Rich object cell | Full `id` / `match` / `open` when titles or classes need care |

### Monitor keys (stable across renumber)

Prefer **`mon0` / `mon1` / `primary`** for everyday authoring (capture emits these).
For multi-host or hybrid-GPU renumber, tiles/layout keys may also be:

| Form | Example |
| --- | --- |
| Full T7 `stableKey` | `"geom:0,0,5120,2880#primary": [ … ]` (from `forge tree`) |
| Short alias | Top-level `"monitors": { "left": "geom:…#primary", "right": "geom:…" }` then tiles use `"left"` / `"right"` |

At plan time Forge resolves keys to mon **index** via the live tree’s `stableKey`s
(rewrites the IR to `monN` before placing windows). Unknown keys error with the
available stableKeys listed.

Forge **normalizes** sugar to v2 IR (`roles[]` + `layout`) before planning.
`forge workon show` prints the expanded profile.

### Rich cells (Chrome / PWAs)

String cells are fine for unique wmClasses. Several Chrome windows need
title matchers:

```json
{
  "tiles": {
    "mon0": [
      [
        {
          "id": "chrome-luke",
          "match": { "class": "Google-chrome", "title~=": "Google Chrome" },
          "open": { "app": "google-chrome", "wmClass": "Google-chrome", "timeout": 25000 }
        },
        {
          "id": "grok",
          "match": { "class": "Google-chrome", "title~=": "Grok" },
          "open": { "app": "Grok", "wmClass": "Google-chrome", "timeout": 25000 }
        }
      ],
      "ghostty"
    ]
  }
}
```

### Nested split (explicit)

```json
{
  "tiles": {
    "mon1": {
      "split": "h",
      "content": [
        "ghostty",
        {
          "split": "v",
          "content": [
            ["youtube", "gmail"],
            "nautilus"
          ]
        }
      ]
    }
  }
}
```

Prefer `{ "split", "content" }` when a nested array would be ambiguous.

### Companions (marginal coexist)

By default, unclaimed windows **already in** a workon slot group stay
(**kept**); role windows are ordered **first** in that group. True
residuals park to overflow (`mon0.overflow` tabbed). Close is never
default — use **`--clean`** only when you want residuals closed.

| Setting / flag | Default | Effect |
| --- | --- | --- |
| `marginal.mode` | `coexist` | Keep slot companions; park residuals |
| `marginal.roleOrder` | `first` | Role windows prefix of the slot group |
| `marginal.mode: "strict"` | — | Park **all** unclaimed (old blunt behavior) |
| `--clean` | off | Close residuals (Meta delete) instead of park |
| `--clean --force` | — | Stronger delete (skip `can_close` veto); **never** process-kill |

Kept companions and claimed role windows are never closed.

Optional top-level `floating: []` is reserved (location later).

### Defaults (omit noise)

| Omitted field | Default |
| --- | --- |
| `version` / `mode` | `2` / `reconcile` when roles or tiles present |
| `overflow` | `mon0.overflow` + `tabbed` |
| `marginal` | `{ "mode": "coexist", "roleOrder": "first" }` |
| mon split | `hsplit` when ≥2 children |
| multi-app pane | `tabbed` |
| single-role pane id | that role id |
| multi-role pane id | auto `s0`, `s1`, … |

## Explicit IR (still valid)

Full `roles[]` + `layout` remains the canonical engine form:

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

Sugar and IR may coexist in one file only via normalize-first: if `tiles` is
present, it wins for structure.

## Reconcile vs steps

| Schema | Behavior |
| --- | --- |
| **v2 reconcile** (`tiles` or `roles` + layout) | Snapshot tree → match roles → open gaps, move/keep/park; second run ≈ no-op |
| **`--clean`** | Residuals close via Meta delete (not park); roles + keeps untouched |
| **v1 steps** (`version: 1` / `mode: "steps"` / `steps[]` without roles) | Replay launch + focus/layout ops (can double apps) |
| **`--force-launch`** | Force the steps path even on a dual profile |

Prefer **v2 reconcile** for daily use.

Examples in-tree:

- `scripts/forge/examples/workon-tiles-minimal.json` — dual-mon sugar  
- `scripts/forge/examples/workon-tiles-nested.json` — nested splits  
- `scripts/forge/examples/workon-minimal.json` — short IR  
- `scripts/forge/examples/workon-dev-v2.json` — richer dual-mon IR sample  

Host profile (shellrc): `$FORGE_WORKON_DIR/hosts/<host>/dev.json` (sugar on black).

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
- Dry-run counts: `reused` / `opened` / `moved` / `kept` / `parked` (or `closed` with `--clean`).
- Optional: `displays` → `gdisplays load`; `settings` → DBus SettingsLoad.
- Offline plan: `--tree-file path/to/GetTree.json` with `--dry-run`.
- Help color: `forge --color=always workon help` (or `never` / `auto`).

More: [scripts/forge/README.md](../../scripts/forge/README.md),
[DESIGN.md](../DESIGN.md).
