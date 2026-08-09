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
# Optional: point at a shellrc multi-machine tree
export FORGE_LAYOUT_DIR=$shellrc/configs/forge/layout
# optional: export FORGE_HOST=$(hostname -s)

forge layout list
forge layout show mydesk
forge layout mydesk --dry-run     # print plan only
forge layout mydesk               # apply on current workspace only
```

Tree root for `hosts/` + `common/` is `FORGE_LAYOUT_DIR` when set, else
`~/.config/forge/layout` (same root `layout save` uses). Apply/show still
resolve common/flat after host (see search order below). **`list` is host-only.**

## Workspace scope

Layouts are **task desks**. Each apply (and save) targets **one workspace** and
only sees windows on that desk. Matching class/title on another workspace is
**invisible** — layout never steals or parks them onto the active desk.

| Rule | Detail |
| --- | --- |
| **Default** | Bare `forge layout <name>` → **current** workspace only |
| **No cross-ws claim** | Plan, open, move, keep, park, structure — all scoped to the target |
| **Open missing** | New apps land on the **target** workspace |
| **Save** | Snapshots **that** workspace only |
| **Indexes** | CLI workspace numbers are **1-based** (`2:dev` = second desk). Tree paths use 0-based Meta indexes (`moNwsW` → workspace **W+1** in CLI) |

### Targeting modes (exclusive)

**All layout args are bare, or all are numbered. Never mix.**

| Mode | Args | Behavior |
| --- | --- | --- |
| **Sequential** | Only bare names | First → **current**, second → current+1, … |
| **Static** | Only `W:name` and/or `name@W` | Each apply on explicit **1-based** workspace W |

| Example | OK? |
| --- | --- |
| `forge layout dev` | Sequential (current only) |
| `forge layout vinyl-graphics video-edit` | Sequential from current |
| `forge layout 1:foo 2:bar 4:baz` | Static |
| `forge layout foo@1 bar@2` | Static (same as `1:foo 2:bar`) |
| `forge layout dev 3:vinyl` | **Error** — mixed sequential + numbered |
| `forge layout 1:foo video-edit` | **Error** — mixed |

There is **no `--on`**. Scripts use static form only: `forge layout 1:foo 2:bar`.

### Preflight (all-or-nothing)

Before any mutate, Forge:

1. Classifies argv mode: all bare | all numbered | **mixed → error, apply nothing**.
2. Resolves every arg → `(workspace, profileName)`.
3. Requires **every** profile to exist (host + user search path) — else **error, apply nothing**.
4. Requires **every** workspace index to exist in this session — else **error, apply nothing**.
5. For sequential, requires the span current..current+N−1 to fit session count — else **error, apply nothing**.

Preflight failures never partial-apply. Dry-run prints per-workspace blocks including:

```text
workspace: 2 (current)
candidates: 5 on ws2 (ignored 8 on other workspaces)
```

### Save name charset

Profile names must **not** contain `:` or `@` (reserved for workspace targeting).
`forge layout save bad:name` errors with a clear message.

## Commands

| Command | What it does |
| --- | --- |
| `forge layout help` | Colorized guide, defaults, minimal example |
| `forge layout list` | **This host only:** Name + Description table (TTY); `[{name,description}]` JSON when stdout is piped |
| `forge layout show <name>` | Header + validated (normalized) profile JSON |
| `forge layout save <name>` | Snapshot **current** workspace → host profile (creates dirs; **overwrites**; no `:`/`@` in name) |
| `forge layout save <name> --stdout` | Print JSON only (no write) |
| `forge layout save <name> --tree-file F` | Offline save from a GetTree forest file |
| `forge layout <name> --dry-run` | Plan only; human counts + plan JSON; **no** mutations |
| `forge layout <name>` | Apply on **current** workspace; short human summary on stderr |
| `forge layout a b` | Sequential: `a` → current, `b` → current+1 (all bare) |
| `forge layout 1:a 3:b` | Static: explicit 1-based workspaces (all numbered) |
| `forge layout a@1 b@3` | Static: same as `1:a 3:b` |
| `forge layout <name> --verbose` | Apply (or dry-run) with full plan/apply JSON on stdout; also `FORGE_VERBOSE=1` |
| `forge layout <name> --safe` | Open missing roles + move wrong-mon roles only (no park / structure / mon ensure) |
| `forge layout <name> --focus TOKEN` | Override profile keyboard focus on load (`ghostty`, `ghostty,0`, JSON `[token, n]`) |
| `forge layout <name> --wait-tree-stable` | Debug: wait for whole GetTree fingerprint quiet before residual place (also `FORGE_LAYOUT_WAIT_TREE_STABLE=1`) |
| `forge layout <name>` | Close non-layout windows (default) |
| `forge layout <name> --keep-others` | Park residuals onto each mon’s last unit (tab join) |
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

**Empty desk / clean layout:** save with no tiled windows (or only floats
such as Guake) writes an empty profile (`[]`). Applying it with the product
default close policy clears the workspace:

```bash
# From Guake with everything else closed, or after closing tiled apps:
forge layout save clean
forge layout clean          # closes all windows on the current workspace
forge layout clean --dry-run
```

**Keep floats on save:** default omits FLOAT windows on **empty** desks so clean
profiles wipe them. Pass `--keep-floats` to record Guake (etc.) under `floating[]`
(also when tiles are empty); apply claims those matches and will not close them
as residuals.

**Focus on save:** `focus` is the last-focused window that is **part of the saved
layout**. If a float is saved and focused (e.g. Guake), focus is that float. If
the keyboard is on a float that is **not** saved, focus falls back to the last
focused **tile** (`lastTileFocusWindowId` / LFT). Override on load with
`--focus` when you save from a terminal but want a different start focus:

```bash
forge layout save desk --keep-floats
forge layout save clean --keep-floats   # empty tiles + floating Guake kept on apply
forge layout desk --focus ghostty,0     # left ghostty even if save was from Guake
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
| Floating | Omitted by default; use `--keep-floats` to capture FLOAT windows |
| Write | Host path above; creates parent dirs; **overwrites** existing file |
| Counts | stderr: mon counts + wrote path / host / name |

Save is a **starting point**. Override with a flat object cell only when inference
is wrong, then dry-run.

## Authoring: bare array (preferred)

Drop this at `~/.config/forge/layout/simple.json` (edit app names):

**Single monitor** — top-level is panes L→R (default mon split = **hsplit**):

```json
[
  { "tab": ["firefox", "code"] },
  "ghostty"
]
```

**Dual monitor** — top-level length equals live mon count; each item is that
mon’s pane list in **physical left→right** order (not Meta `mon0`/`mon1`
when those differ — e.g. some X11 / renumber layouts):

```json
[
  [ { "tab": ["google-chrome", "Grok"] }, "ghostty" ],
  [ "ghostty", { "tab": ["YouTube", "Gmail", "Google Voice"] } ]
]
```

| Sugar | Meaning |
| --- | --- |
| Bare top-level array | **Implicit mons (physical L→R):** if `len == live mon count` and each item is a mon body list → body[0] = leftmost head, body[1] = next, … (via GetTree geometry). Offline (no tree): dual only when every top-level item is a **list**, bound as mon0..monN-1 |
| `{ "mon0": […], "mon1": […] }` | **Explicit Meta index** — `monN` is Mutter monitor index (may not be L→R); never fold mon1→mon0 when a head is missing |
| `{ "monitors": [ […], […] ] }` | **Explicit mon list by Meta index** (same no-fold rule) |
| `{ "tab": ["a","b"] }` | Tabbed pane (also `t` / `tabbed`) |
| `{ "stack": ["a","b"] }` | Stacked pane (also `s` / `stacked`) |
| `{ "tab": […], "active": "Grok" }` | Tab/stack open leaf (first match in group) |
| `{ "tab": […], "active": 1 }` | Open 2nd child in the group (0-based) |
| `{ "tab": […], "active": ["Grok", 1] }` | 2nd Grok match **in this group** |
| `{ "hsplit": [ … ] }` / `{ "vsplit": [ … ] }` | Split CON (also `h`/`horizontal`, `v`/`vertical`) |
| `{ "hsplit": […], "share": [0.67, 0.33] }` | Custom sibling shares (width on hsplit, height on vsplit) |
| `{ "hsplit": […], "ratio": [2, 1] }` | Same as `share` with unnormalized weights |
| Untyped pane list of apps | Still **tabbed** (legacy); save emits `{ "tab": … }` |
| Untyped list of panes | **hsplit** of children (equal shares) |
| `"ghostty"` | One pane, one role; class stem matches reverse-DNS wmClass |
| `"Grok"` / `"YouTube"` | Chrome PWA-ish: class + `title~=` inferred from the string |
| Flat object | `{ "app", "class", "title~=" }` override when inference is not enough |

**Tile sizes (share):** siblings of an h/v split take space by fraction along the
split axis. Omit `share` for equal panes. Weights may be fractions or ratios
(`[2,1]` → about ⅔ / ⅓); Forge renormalizes to sum 1. Load re-applies shares
after structure (so moves that reset percents do not stick). Session install
restore also keeps `percent` + `userSized` on the live tree.

**Save:** `forge layout save <name>` writes bare arrays with medium keys
(`tab`, `stack`, `hsplit`, `vsplit`). Pass **`--monitors`** to emit explicit
`mon0` / `mon1` / … keys instead (no mon fold on mismatch). When a tab/stack
has a non-default open leaf, save emits `"active"`. When a window is focused,
save wraps with `"focus"` (object form). **Mon-root VSPLIT** (e.g. app under
another on the same head) is saved as `{ "vsplit": [ … ] }` for that mon body —
a bare pane list always means **hsplit** on load. After you **resize** tiles
(`userSized`), save wraps that mon/split with `"share": […]`; equal desks stay
bare (no share noise).

### Object form (when you need more)

```json
{
  "description": "optional — never required to load",
  "focus": "Grok",
  "tiles": [
    { "tab": ["google-chrome", "Grok"], "active": "Grok" },
    "ghostty"
  ],
  "floating": [ … ]
}
```

- `description` — cosmetics for `list` / humans (auto one-liner if omitted).
- `focus` — keyboard focus after load (desk-wide). Forms (all **0-based**):
  - `"Grok"` ≡ `["Grok", 0]` — first matching role in profile roles order
  - `["Grok", 1]` — 2nd Grok role desk-wide
  - `"Grok-2"` — explicit role id
  - `1` — 2nd role in profile roles order
- `active` on `{ "tab" | "stack": […] }` — which member is open **in that group**
  (does not reorder the tab strip; L→R order stays as listed). Same sugar:
  token, `n` index into the group content, or `[token, n]` among matches in the
  group only. Save emits `[token, n]` when two leaves share a token (e.g. dual Grok).
- **Open leaf when `active` is omitted (reopen):** if a tab/stack already has a
  surviving member and layout **opens** a companion into that group, Forge keeps
  the open leaf on the **survivor** (prefers live `lastTabFocus` among survivors,
  else the first surviving role in profile order). Newly opened windows do **not**
  steal the open tab. Set `"active"` when you always want a specific member (e.g.
  always Grok after load). Bare dual-mon arrays without `active` use this survivor
  rule — useful after closing chrome and re-running `forge layout dev` with Grok
  still on the desk.
- `tiles` as mon map (`mon0` / `mon1` / `primary` / stableKey) remains valid **advanced** sugar.
- `floating` only when you have float roles.

### Monitor keys (stable across renumber)

Everyday **bare arrays** use **physical left→right** order from the live tree
(geometry / `geom:` stableKey). Explicit `monN` is always the **Meta monitor
index** (`moNwsW` in `forge tree`) — that may differ from L→R after X11/GPU
renumber. Prefer bare arrays or geometry roles when you mean “left desk.”

| Form | Example |
| --- | --- |
| `monN` / `primary` | `"mon0": [ … ]` inside a `tiles` object (Meta index) |
| `left` / `right` / `top` / `bottom` | `"left": [ … ]` — physical side from live tree rect |
| Full T7 `stableKey` | `"geom:0,0,5120,2880#primary": [ … ]` (from `forge tree`) |
| Short alias | Top-level `"monitors": { "L": "geom:…#primary", "R": "geom:…" }` then tiles use `"L"` / `"R"` (aliases may also be named `left`/`right` and override builtin geometry roles) |

At plan time Forge resolves keys to mon **index** via the live tree
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
(**kept**). True residuals are **closed** so `forge layout` ends with
only profile windows. **`--keep-others`** soft-parks residuals onto each
monitor’s last unit (tab-join; lone app becomes a tab group). **`--safe`**
leaves residuals put (open+move only).

| Setting / flag | Default | Effect |
| --- | --- | --- |
| `marginal.mode` | `coexist` | Keep slot companions; residual policy separate |
| `marginal.residual` | `leave` | Profile hint when CLI does not force close/park |
| `marginal.residual: "park"` | — | Soft park (library API; CLI uses `--keep-others`) |
| `marginal.roleOrder` | `first` | Orders **new** groups only; never re-tab for order |
| `marginal.mode: "strict"` | — | No keep; residual close/park still applies |
| `--safe` | off | Open missing roles + move wrong-mon roles only; leave everything else |
| residual close | **on** | Close non-layout windows (product default) |
| `--keep-others` / `--keep` | off | Park residuals onto last mon unit (tab join) |
| `--clean --force` | — | Stronger delete (skip `can_close` veto); **never** process-kill |

Kept companions and claimed role windows are never closed.

### Cold apply (empty desk)

On a **cold empty** desk (no claimed role windows), one `forge layout <name>`:

1. **Skeleton** — mon splits + tab/stack groups + slot-tagged placeholder tiles  
2. **Open** missing roles (parallel under LayoutBatch)  
3. **Bind** each mapped window into its skeleton slot  
4. **Order / size** once; residual close/park after bind  
5. **Hard-ready** pin roles (TILE + rect + mon; hard timeout ~5s)  
6. **Focus once** (profile `active` / open leaf + keyboard `focus`)  
7. **Soft residual barrier** — wait a learned quiet window (per host + app
   class) for late activate/focus steal; on steal, correct immediately and
   reset quiet. Heuristics file:
   `~/.config/forge/config/settle-heuristics.json` (updated after layout).  
8. **Post-settled verify once** — re-apply only still-mismatched open leaves /
   keyboard focus; not a blind double raise  

No happy-path second structure pass, Mode B recover, or stacked focus reassert.
Optional belt after residual only rehomes just-opened roles still on the wrong
monitor (moves only). Chaos recover: mid-session Mode B, or env
`FORGE_LAYOUT_POST_OPEN_RETRY=1`.

Thrash detection may still print on stderr for info; it does **not** force Mode B
park mid-open or mid-bind. Mode B remains for true mid-session chaos (scrambled
desk with existing role windows), not as a second cold pass.

Settled re-run on a perfect tree stays a no-op (`nothing to do`).

### Thrash modes (auto)

Every reconcile plan detects desk health (`plan.thrashState`) and picks a mode:

| Mode | When | Behavior |
| --- | --- | --- |
| **A collect** | Desk looks sane | Open gaps, move wrong-mon roles, tab marginals into overlapping views |
| **B thrash-recover** | Mid-session thrash (not cold empty / not mid-bind) | Place roles only; soft-park every other tiled window to last mon last group |

Human stderr (dry-run and apply) includes:

```text
  mode=A collect
  # or:
  mode=B thrash-recover
  thrashState  thrashed score=N reasons=...
  thrashRisk  N (…optional plan-risk reasons when score > 0)
```

Cold empty path uses skeleton+bind (above), not Mode B. Mid-session thrash still
auto Mode B parks when not clean. `--safe` still reports Mode A/B but only emits
open/move actions.

Companions stacked under a role with VSPLIT/HSPLIT (including nested CONs)
stay **Mode A**: they tab into that view. Only true thrash (wrong mon, excess
mon children, multi-role tab groups broken) uses Mode B park mid-session.

Optional top-level `floating` lists float roles (from `--keep-floats` or hand
edit). Apply claims matching windows so residual close leaves them alone; it
does not open missing floats or re-float tiled windows.

### Defaults (omit noise)

| Omitted field | Default |
| --- | --- |
| `version` / `mode` | `2` / `reconcile` when roles or tiles present |
| `description` | auto one-liner from structure (`list` / `show`) |
| `overflow` | `mon0.overflow` + `tabbed` |
| `marginal` | `{ "mode": "coexist", "roleOrder": "first", "residual": "leave" }` |
| mon split | `hsplit` when ≥2 children |
| multi-app bare array | `tabbed` |
| multi-app `{ "layout": "stacked", … }` | `stacked` |
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
| **v2 reconcile** (bare array, `tiles`, or `roles` + layout) | Snapshot tree → match roles → open gaps, move/keep; close residuals by default; second run ≈ no-op |
| **`--keep-others`** | Residuals park onto last mon unit (tab join); roles + keeps untouched |
| **v1 steps** (`version: 1` / `mode: "steps"` / `steps[]` without roles) | Replay launch + focus/layout ops (can double apps) |
| **`--force-launch`** | Force the steps path even on a dual profile |

Prefer **v2 reconcile** for daily use.

Examples in-tree:

- `scripts/forge/examples/layout-tiles-minimal.json` — dual-mon bare array  
- `scripts/forge/examples/layout-tiles-nested.json` — nested splits  
- `scripts/forge/examples/layout-minimal.json` — short IR  
- `scripts/forge/examples/layout-dev-v2.json` — richer dual-monitor IR sample  

Host profiles: `<tree>/hosts/<host>/<name>.json` (`FORGE_LAYOUT_DIR` or
`~/.config/forge/layout`).

## Where profiles live

**Tree root** (`layout_tree_root`): `FORGE_LAYOUT_DIR` if set, else
`~/.config/forge/layout`. List, resolve, and save all share this root for
`hosts/` + `common/`.

Search order for **show / apply** (**first hit wins**):

```text
1. FORGE_LAYOUT_PATH                         # stem must match name + file exists
2. <tree>/hosts/<host>/<name>.json
3. <tree>/hosts/<host>/<name>/profile.json
4. <tree>/common/<name>.json
5. <tree>/<name>.json                        # flat next to hosts/
6. ~/.config/forge/layout/<name>.json        # flat XDG (if tree root differs)
```

`<host>` is `FORGE_HOST` or the short hostname. Save always writes
`<tree>/hosts/<host>/<name>.json` (creates dirs; overwrites).

### `forge layout list`

| Mode | Output |
| --- | --- |
| **TTY** | Two-column table: **Name** + **Description** (no path/source clutter) |
| **Piped / non-TTY** | JSON array of `{ "name", "description" }` on stdout |

Only profiles under **this host** (`hosts/<host>/…`) appear. Common, flat XDG,
and `FORGE_LAYOUT_PATH` entries are omitted from the list (they still resolve
for `show` / apply). Description is the file’s `description` when set, else an
auto one-liner from structure (same as `show`).

| Env | Role |
| --- | --- |
| `FORGE_LAYOUT_DIR` | Optional override of tree root (`hosts/`, `common/`) |
| `FORGE_HOST` | Override short hostname (else `hostname` without domain) |
| `FORGE_LAYOUT_PATH` | One-shot absolute profile path (resolve only; not in `list`) |

Forge does **not** hardcode shellrc paths — export `FORGE_LAYOUT_DIR` from your
shell init when you keep a multi-machine tree outside XDG.

## Tips

- Always dry-run a new profile: `forge layout <name> --dry-run`.
- Default apply/save is **current workspace only** — other desks stay isolated.
- Dry-run shows `candidates: N on wsK (ignored M on other workspaces)` per target.
- Title matchers (`title~=`) disambiguate several windows of the same class.
- Counts: `reused` / `opened` / `moved` / `kept` / `closed` (default) / `parked` (`--keep-others`) / `structure`.
- Default apply is quiet (stderr only); use `--verbose` or `FORGE_VERBOSE=1` for plan JSON.
- Optional: `displays` → `gdisplays load`; `settings` → DBus SettingsLoad.
- Offline plan: `--tree-file path/to/GetTree.json` with `--dry-run` (uses forest `meta` for active/n workspaces when present).
- Help color: `forge --color=always layout help` (or `never` / `auto`).
- Wayland and X11 share the same CLI; workspace scope behavior is session-type-agnostic.

More: [scripts/forge/README.md](../../scripts/forge/README.md),
[DESIGN.md](../DESIGN.md).
