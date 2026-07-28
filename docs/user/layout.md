# Layout profiles

`forge layout` applies a **named layout profile** — a named desk you can restore
anytime (not morning-only). Desired-state reconcile: reuse matching windows,
open only gaps, keep companions already in a layout slot, and **leave** true
residuals where they are. Running twice should not double apps.

Profiles are **user JSON** (shellrc host tree or `~/.config/forge/layout/`).

**Forge is app-agnostic.** Roles, match rules, and layout live only in your
JSON. Nothing in the extension or CLI hardcodes Ghostty, Chrome, hostnames,
or a “dev” desk.

Interactive guide (colorized):

```bash
forge layout help
forge help            # acronyms (LFT, …) + all commands
```

## Quick start

```bash
# Point at shellrc host profiles (multi-machine tree)
export FORGE_LAYOUT_DIR=$shellrc/configs/forge/layout
# optional: export FORGE_HOST=$(hostname -s)

forge layout list
forge layout show mydesk
forge layout mydesk --dry-run     # print plan only
forge layout mydesk               # apply
```

Without `FORGE_LAYOUT_DIR`, only `FORGE_LAYOUT_PATH` (if set) and
`~/.config/forge/layout/<name>.json` are searched.

## Commands

| Command | What it does |
| --- | --- |
| `forge layout help` | Colorized guide, defaults, minimal example |
| `forge layout list` | Human lines on stderr; JSON array on **stdout** |
| `forge layout show <name>` | Header + validated (normalized) profile JSON |
| `forge layout save <name>` | Snapshot tree → host profile file (creates dirs; **overwrites**) |
| `forge layout save <name> --stdout` | Print JSON only (no write) |
| `forge layout save <name> --tree-file F` | Offline save from a GetTree forest file |
| `forge layout <name> --dry-run` | Plan only; human counts + plan JSON; **no** mutations |
| `forge layout <name>` | Apply; short human summary on stderr (no plan JSON) |
| `forge layout <name> --verbose` | Apply (or dry-run) with full plan/apply JSON on stdout; also `FORGE_VERBOSE=1` |
| `forge layout <name> --safe` | Open missing roles + move wrong-mon roles only (no park / structure / mon ensure) |
| `forge layout <name> --clean` | Close residuals (Meta delete) instead of leave/park |
| `forge layout <name> --clean --force` | Stronger Meta delete; **never** process-kill |
| `forge layout <name> --force-launch` | Imperative `steps[]` only (errors if none) |

## Save (authoring assist)

Lay out the desk by hand once, then snapshot a profile:

```bash
export FORGE_LAYOUT_DIR=$shellrc/configs/forge/layout   # optional host tree
forge layout save mydesk
# offline / tests:
forge layout save mydesk --tree-file forest.json
# pipe only (no write):
forge layout save mydesk --stdout > /tmp/mydesk.json
forge layout mydesk --dry-run
```

Write path (overwrites if present):

```text
$FORGE_LAYOUT_DIR/hosts/<host>/<name>.json
# or without FORGE_LAYOUT_DIR:
~/.config/forge/layout/hosts/<host>/<name>.json
```

| Detail | Behavior |
| --- | --- |
| Shape | **Bare JSON array** when possible (string cells + tab lists); object form only when needed |
| Strings | App token is both open target and match seed (`google-chrome`, `Grok`, `ghostty`) |
| Description | Optional; pure auto one-liners are omitted on save (`list`/`show` recompute). Custom text is kept |
| Floating | Omitted when empty; present only if float windows were captured |
| Write | Host path above; creates parent dirs; **overwrites** existing file |
| Counts | stderr: mon counts + wrote path / host / name |

Save is a **starting point**. Override with a flat object cell only when inference
is wrong, then dry-run.

## Authoring: bare array (preferred)

Drop this at `~/.config/forge/layout/simple.json` (edit app names):

**Single monitor** — top-level is panes L→R:

```json
[ ["firefox", "code"], "ghostty" ]
```

**Dual monitor** — top-level length = mon count; each item is that mon’s panes:

```json
[
  [ ["google-chrome", "Grok"], "ghostty" ],
  [ "ghostty", ["YouTube", "Gmail", "Google Voice"] ]
]
```

| Sugar | Meaning |
| --- | --- |
| Top-level mon list | `mon0`, `mon1`, … in order (when ≥2 items look like mon bodies) |
| Top-level panes | Single mon (or flat cells) → all on mon0 |
| `[ a, b ]` mon body | Two mon children; default **hsplit**; **array order = L→R** |
| `["app1", "app2"]` | One pane, multi-role, **tabbed**; **array order = tab order** |
| `"ghostty"` | One pane, one role; class stem matches reverse-DNS wmClass |
| `"Grok"` / `"YouTube"` | Chrome PWA-ish: class + `title~=` inferred from the string |
| Flat object | `{ "app", "class", "title~=" }` override when inference is not enough |
| `"split": "h"` / `"v"` / … | Override split |
| `{ "split", "content": […] }` | Nested split node |

`forge layout save` writes the bare array when mon index order is enough and
there is no custom description / floating. Load respects mon L/R and tab order.

### Object form (when you need more)

```json
{
  "description": "optional — never required to load",
  "tiles": [ ["firefox", "code"], "ghostty" ],
  "floating": [ … ]
}
```

- `description` — cosmetics for `list` / humans (auto one-liner if omitted).
- `tiles` as mon map (`mon0` / `mon1` / `primary` / stableKey) remains valid **advanced** sugar.
- `floating` only when you have float roles.

### Monitor keys (stable across renumber)

Everyday bare arrays use index order. For multi-host or hybrid-GPU renumber,
tiles/layout keys may also be:

| Form | Example |
| --- | --- |
| `monN` / `primary` | `"mon0": [ … ]` inside a `tiles` object |
| Full T7 `stableKey` | `"geom:0,0,5120,2880#primary": [ … ]` (from `forge tree`) |
| Short alias | Top-level `"monitors": { "left": "geom:…#primary", "right": "geom:…" }` then tiles use `"left"` / `"right"` |

At plan time Forge resolves keys to mon **index** via the live tree’s `stableKey`s
(rewrites the IR to `monN` before placing windows). Unknown keys error with the
available stableKeys listed.

Forge **normalizes** sugar to v2 IR (`roles[]` + `layout`) before planning.
`forge layout show` prints the expanded profile.

### Rich cells (overrides only)

Prefer strings. Use a rich object when you need timeout, custom id, or a match
that inference cannot rebuild:

```json
[
  [
    {
      "id": "chrome-luke",
      "match": { "class": "Google-chrome", "title~=": "Google Chrome" },
      "open": { "app": "google-chrome", "wmClass": "Google-chrome", "timeout": 25000 }
    },
    "Grok"
  ],
  "ghostty"
]
```

### Nested split (explicit)

```json
[
  "ghostty",
  {
    "split": "v",
    "content": [
      ["youtube", "gmail"],
      "nautilus"
    ]
  }
]
```

Or under a mon map / dual-mon bare array. Prefer `{ "split", "content" }` when a
nested array would be ambiguous.

### Companions (marginal coexist)

By default, unclaimed windows **already in** a layout slot group stay
(**kept**). True residuals are **left in place** (status `left`) so
`forge layout` never cross-mon parks them. Opt-in soft park appends onto
the last claimed role window (no mon-root dump). Close is never default —
use **`--clean`** only when you want residuals closed.

| Setting / flag | Default | Effect |
| --- | --- | --- |
| `marginal.mode` | `coexist` | Keep slot companions; residual policy separate |
| `marginal.residual` | `leave` | Leave true residuals put (zero thrash) |
| `marginal.residual: "park"` | — | Soft park onto last claimed role window |
| `marginal.roleOrder` | `first` | Orders **new** groups only; never re-tab for order |
| `marginal.mode: "strict"` | — | No keep; residual leave|park still applies |
| `--safe` | off | Open missing roles + move wrong-mon roles only; leave everything else |
| `--clean` | off | Close residuals (Meta delete) instead of leave/park |
| `--clean --force` | — | Stronger delete (skip `can_close` veto); **never** process-kill |

Kept companions and claimed role windows are never closed.

### Thrash modes (auto)

Every reconcile plan detects desk health (`plan.thrashState`) and picks a mode:

| Mode | When | Behavior |
| --- | --- | --- |
| **A collect** | Desk looks sane | Open gaps, move wrong-mon roles, tab marginals into overlapping views |
| **B thrash-recover** | Thrash detected | Place roles only; soft-park every other tiled window to last mon last group |

Human stderr (dry-run and apply) includes:

```text
  mode=A collect
  # or:
  mode=B thrash-recover
  thrashState  thrashed score=N reasons=...
  thrashRisk  N (…optional plan-risk reasons when score > 0)
```

Default product path **auto recovers** with Mode B when thrashed (no refuse gate).
`--safe` still reports Mode A/B but only emits open/move actions.

Companions stacked under a role with VSPLIT/HSPLIT (including nested CONs)
stay **Mode A**: they tab into that view. Only true thrash (wrong mon, excess
mon children, multi-role tab groups broken) uses Mode B park.

Optional top-level `floating` is reserved for float roles (omit when empty).

### Defaults (omit noise)

| Omitted field | Default |
| --- | --- |
| `version` / `mode` | `2` / `reconcile` when roles or tiles present |
| `description` | auto one-liner from structure (`list` / `show`) |
| `overflow` | `mon0.overflow` + `tabbed` |
| `marginal` | `{ "mode": "coexist", "roleOrder": "first", "residual": "leave" }` |
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

Sugar and IR may coexist in one file only via normalize-first: if `tiles` (or a
bare array) is present, it wins for structure.

## Reconcile vs steps

| Schema | Behavior |
| --- | --- |
| **v2 reconcile** (bare array, `tiles`, or `roles` + layout) | Snapshot tree → match roles → open gaps, move/keep/park; second run ≈ no-op |
| **`--clean`** | Residuals close via Meta delete (not park); roles + keeps untouched |
| **v1 steps** (`version: 1` / `mode: "steps"` / `steps[]` without roles) | Replay launch + focus/layout ops (can double apps) |
| **`--force-launch`** | Force the steps path even on a dual profile |

Prefer **v2 reconcile** for daily use.

Examples in-tree:

- `scripts/forge/examples/layout-tiles-minimal.json` — dual-mon bare array  
- `scripts/forge/examples/layout-tiles-nested.json` — nested splits  
- `scripts/forge/examples/layout-minimal.json` — short IR  
- `scripts/forge/examples/layout-dev-v2.json` — richer dual-monitor IR sample  

Host profiles (optional multi-machine tree):
`$FORGE_LAYOUT_DIR/hosts/<host>/<name>.json`.

## Where profiles live

Search order (**first hit wins**):

```text
1. FORGE_LAYOUT_PATH                         # stem must match name
2. $FORGE_LAYOUT_DIR/hosts/<host>/<name>.json
3. $FORGE_LAYOUT_DIR/hosts/<host>/<name>/profile.json
4. $FORGE_LAYOUT_DIR/common/<name>.json
5. ~/.config/forge/layout/<name>.json        # XDG
```

| Env | Role |
| --- | --- |
| `FORGE_LAYOUT_DIR` | Root of the shellrc-style tree (`hosts/`, `common/`) |
| `FORGE_HOST` | Override short hostname (else `hostname` without domain) |
| `FORGE_LAYOUT_PATH` | One-shot absolute profile path |

Forge does **not** hardcode shellrc paths — export `FORGE_LAYOUT_DIR` from your
shell init when you want host profiles.

## Tips

- Always dry-run a new profile: `forge layout <name> --dry-run`.
- Title matchers (`title~=`) disambiguate several windows of the same class.
- Counts: `reused` / `opened` / `moved` / `kept` / `left` / `parked` / `structure` (or `closed` with `--clean`).
- Default apply is quiet (stderr only); use `--verbose` or `FORGE_VERBOSE=1` for plan JSON.
- Optional: `displays` → `gdisplays load`; `settings` → DBus SettingsLoad.
- Offline plan: `--tree-file path/to/GetTree.json` with `--dry-run`.
- Help color: `forge --color=always layout help` (or `never` / `auto`).

More: [scripts/forge/README.md](../../scripts/forge/README.md),
[DESIGN.md](../DESIGN.md).
