# Plan: Idempotent `forge workon` (desired-state layout)

**Status:** **Complete** (WR1–WR15 + WR6–WR9)
**Priority:** **P1 product** (day-to-day #3 after live regression watch)  
**Base:** this tree; builds on [forge-command.md](./forge-command.md) FC0–FC5  
**Related:** OP1 open-app, T6 GetTree, shellrc `gdisplays` host layout  

### Session note (2026-07-27)

**WR9 verified Done** (shellrc `forge.zsh` already exports `FORGE_WORKON_DIR`).
**Workon plan complete:** WR1–WR15 + WR6–WR9 all Done.
Optional residual: mon1 tab roleOrder structure settle (opened stays 0).
**Next:** regression watch; meta personal-fork / B1 only if prioritized.


---

## Why this is next

| Rank (PRIORITY) | Item | Relation |
| ---: | --- | --- |
| 1–2 | Blank/wake + core tiling | **Shipped** — only reopen if thrash returns |
| **3 (this)** | **Idempotent morning layout** | Highest *new* product win: stop wasting minutes + stop doubling apps |
| 4 | Regression watch | Stays default when a live bug appears — outranks this if thrash returns |
| Meta | Personal fork / audit B1 | Below this for daily use |

**Not higher than a live thrash/tab bug.** Higher than personal-fork and
tidy extracts. Higher than T9 polish.

FC5 (`forge workon`) proved the command name and step engine. It is the
**wrong default** for daily use: every run spawns again. The human goal is
“make my desk look like *dev*,” not “replay a launch script.”

---

## Human experience (first-class)

### Job story

> Sitting down (or returning from chaos), I run one command. Without
> thinking about what is already open, I get **the same comfortable dual-mon
> layout**. Running it twice does **nothing harmful**. Extra windows are
> kept when they already live in a workon slot, otherwise parked — not
> destroyed. I never babysit tiles for ten minutes. Writing a profile is a
> five-line nested list of apps, not a roles+layout essay.

### UX principles

| Principle | Concrete |
| --- | --- |
| **Idempotent by default** | Second `forge workon dev` ≈ no-op if already satisfied |
| **Reuse before open** | Match existing tiles; launch only gaps |
| **Never surprise-kill** | Residuals park (overflow); close only with `--clean` |
| **Coexist by default** | Companions already in a workon slot stay; roles ordered first |
| **Author by sketch** | Compact `tiles` sugar; engine expands to v2 IR |
| **Opinionated defaults** | Split, tabbed, ids, marginal — omit noise |
| **Visible plan** | `--dry-run` prints reused / open / move / park / kept before apply |
| **Honest report** | JSON summary after run (counts + role → window) |
| **Fast enough** | Sub-second plan; apply dominated by any needed launches |
| **Host-aware configs** | Same profile *name* can differ per machine (mon count, apps) |
| **One place for many machines** | Profiles versioned in shellrc; not only `~/.config` on one box |
| **Discoverable** | `forge workon list` shows host + which file won |
| **Escape hatch** | `--force-launch` keeps imperative FC5 path for debug |
| **Full schema remains** | Explicit `roles` + `layout` always valid (canonical IR) |

### Feel of a good morning

```text
$ forge workon dev
forge workon: host=black profile=dev
  reused  6   opened  0   moved  1   kept  2   parked  0
  ok

$ forge workon dev          # already perfect
forge workon: nothing to do (6 roles satisfied)
```

### What humans should *not* need to know

- Tree path indices (`mo0ws0/1/0`)
- Whether a PWA reports `crx_*` vs `Google-chrome` (until match fails)
- Whether Chrome profile dir is `Default`
- Order of aspect-split vs tab layout ops
- Explicit `layout: tabbed` / `split: hsplit` for the common case

They declare **apps in places** (sugar) or **roles + shape** (IR); the
planner owns structure repair, claim, and companions.

---

## Product locks

| Topic | Decision |
| --- | --- |
| Default mode | **Reconcile** (desired state), not imperative steps |
| FC5 steps | Still supported (`version: 1` / `mode: steps`) for scripts |
| Canonical IR | v2: `roles[]` + `layout` (or desugared equivalent) |
| Authoring UX | **Compact `tiles` sugar** (preferred); desugars → IR before plan |
| Matching | Role matchers claim **at most one** window each (global claim set) |
| Missing role | Launch via existing `open` / `app` once, then place |
| Extra copies of a role | First claim wins; extras → residual (not auto-companion unless already in slot CON) |
| **Marginal default** | `marginal.mode = "coexist"` (omit-noise) |
| **roleOrder default** | `"first"` — role windows prefix of slot membership |
| Coexist | Unclaimed already in a workon **slot set** → **keep** after roles |
| Residuals | Not in any slot set → **overflow** (default `mon0.overflow` tabbed) |
| Close | **Never** default; `--clean` / profile opt-in later (WR15) |
| Slot model | Every named slot is a **logical group**; physical CON only when 2+ members (tree collapses 1-child CONs) |
| Multi-app pane | Infer **tabbed** from ≥2 apps/roles (override: stacked / explicit split) |
| Mon split | Infer from geometry (wider-than-tall → **h**, else **v**); override `split: "h"` / `"v"` / `"hsplit"` / … |
| Nested splits | Nested arrays / `{ split, content }` in sugar → nested layout IR |
| Role ids | Auto from open token; de-dupe with `-2`, `-3`, … or mon/slot suffix |
| Floating | Top-level `floating: []` (not mon-owned); location later |
| Dry-run | `--dry-run` |
| Force old behavior | `--force-launch` or profile `mode: "steps"` |
| Nearest-slot residual | **Not default** — later opt-in only |

---

## Compact sugar (authoring)

### Happy path (most desks)

Root key **`tiles`** (preferred short name; `layout` still accepted as IR /
explicit form). Array under `monN` = left→right (or top→bottom if v-split)
panes. Nested array = tab group. Bare string = single app in that pane.

```json
{
  "tiles": {
    "mon0": [
      ["google-chrome …", "grok …"],
      "ghostty"
    ],
    "mon1": [
      "ghostty",
      ["youtube …", "gmail …", "voice …"]
    ]
  },
  "floating": []
}
```

| Sugar | Meaning |
| --- | --- |
| `monN: [ a, b ]` | Two mon children; **split inferred** (dual 4K → usually `h`) |
| `["app1", "app2"]` | One slot, two roles, **tabbed** |
| `"ghostty"` | One slot, one role (logical group of 1; no lonely tab chrome) |
| `["ghostty"]` | Same as bare string |
| Nested deeper | Nested split node (see below) |
| String cell | Role: open (+ best-effort match); id auto |
| Rich object cell | Full role fields when match needs titles / class |

**Top-level `tiles` vs bare mon map:** Prefer `"tiles": { "mon0": … }`.
A bare `{ "mon0": … }` only if unambiguous (no clash with other keys).
Do **not** require a redundant `"layout"` wrapper for sugar — `tiles` *is*
the human layout. Canonical IR may still use `layout` after normalize.

### Explicit split override + nested

```json
{
  "tiles": {
    "mon0": [
      ["google-chrome …", "grok …"],
      "ghostty"
    ],
    "mon1": {
      "split": "h",
      "content": [
        "ghostty",
        {
          "split": "v",
          "content": [
            ["youtube …", "gmail …", "voice …"],
            "nautilus"
          ]
        }
      ]
    }
  },
  "floating": []
}
```

Array-only form can nest arrays for the same structure when unambiguous
(e.g. mon1 right child is `[ [yt, gmail, voice], "nautilus" ]` with inferred
v-split on that node by aspect). Prefer explicit `{ "split": "v", "content": … }`
when the nest would be ambiguous.

### Split aliases

| Write | Normalized |
| --- | --- |
| `h`, `horizontal`, `hsplit` | `hsplit` |
| `v`, `vertical`, `vsplit` | `vsplit` |
| omit | geometry: width ≥ height → h, else v (per mon or node rect when known; dual-mon desk default h for top-level mon) |

### Desugar pipeline

```text
profile JSON
  → detect sugar (tiles / nested arrays / string cells)
  → normalize_profile() → canonical v2 { roles[], layout, marginal, overflow, … }
  → plan_reconcile(forest, ir)   # existing pure planner
```

One planner. Two spellings. Dry-run may show expanded role ids + slots.

### Cell → role defaults

| Cell | id | open | match |
| --- | --- | --- | --- |
| `"ghostty"` | `ghostty` (then `ghostty-2` …) | app/command token | best-effort class / desktop id |
| `"google-chrome …"` | stem of command | full open argv/app | weak until refined |
| `{ "id", "match", "open" }` | as given | as given | as given |

Duplicate open tokens across slots (two Ghostties) → distinct ids;
claim still prefers mon/slot order.

---

## Marginal apps + atomic slots

### Defaults (omit-noise)

```json
"marginal": { "mode": "coexist", "roleOrder": "first" }
```

Only write when different (`strict` park-all unclaimed, later `clean`).

### Logical slot = membership set

| Layer | Rule |
| --- | --- |
| **Planner** | Every named slot is an atomic bag: roles (ordered) + companions |
| **Tree** | 1 member → bare tile (collapse OK). 2+ → tabbed/stacked CON |
| **Coexist** | Unclaimed already in slot set → keep after roles |
| **Residual** | Not in any slot set → overflow |
| **Promote** | Companion join on singleton → create tab CON; roles first |

### `--clean` (WR15, not default)

| Flag | Behavior |
| --- | --- |
| default | coexist + park residuals |
| `--clean` | close residuals only (after claim + keep); respect close veto |
| `--clean --force` | stronger close where API allows — never process-kill |

---

## Config locations (host-based, multi-machine)

Mirror **gdisplays**: app code in Forge; **user data in shellrc**.

### Search order (first hit wins)

```text
1. FORGE_WORKON_DIR / FORGE_WORKON_PATH   # explicit override
2. $shellrc/configs/forge/workon/hosts/<hostname>/<name>.json
3. $shellrc/configs/forge/workon/hosts/<hostname>/<name>/profile.json  # optional dir form
4. $shellrc/configs/forge/workon/common/<name>.json                    # shared across hosts
5. ~/.config/forge/workon/<name>.json                                 # local XDG (today)
```

| Piece | Owner |
| --- | --- |
| Planner + executor + sugar normalize | **Forge** (`scripts/forge/`) |
| Profile JSON per host | **shellrc** `configs/forge/workon/hosts/<host>/` |
| Shared templates | shellrc `configs/forge/workon/common/` |
| Env | `FORGE_WORKON_DIR`, `FORGE_HOST` (like `GDISPLAYS_HOST`) |

---

## Desired-state model (canonical IR)

Still the engine target. Sugar expands into this.

### Role

```json
{
  "id": "grok",
  "match": { "class": "Google-chrome", "title~=": "Grok" },
  "open": { "app": "Grok", "wmClass": "Google-chrome", "timeout": 25000 },
  "slot": "mon0.left-tab"
}
```

### Layout shape (slots)

Explicit IR (also what dry-run expansion may show):

```json
{
  "version": 2,
  "marginal": { "mode": "coexist", "roleOrder": "first" },
  "overflow": { "slot": "mon0.overflow", "layout": "tabbed" },
  "layout": {
    "mon0": {
      "split": "hsplit",
      "children": [
        { "id": "s0", "layout": "tabbed", "roles": ["chrome-luke", "grok"] },
        { "id": "s1", "roles": ["ghostty"] }
      ]
    },
    "mon1": {
      "split": "hsplit",
      "children": [
        { "id": "s0", "roles": ["ghostty-2"] },
        { "id": "s1", "layout": "tabbed", "roles": ["youtube", "gmail", "voice"] }
      ]
    }
  },
  "roles": [ /* … */ ]
}
```

### Black `dev` (target)

| Slot | Roles |
| --- | --- |
| mon0 left tab | Chrome (main), Grok PWA |
| mon0 right | Ghostty |
| mon1 left | Ghostty |
| mon1 right tab | YouTube, Gmail, Google Voice PWAs |
| companions | e.g. Nautilus with Ghostty, social in left tab — **kept** under coexist |
| overflow | True residuals only |

---

## Algorithm

```text
1. Resolve profile path (host search order)
2. normalize_profile (sugar → IR; fill marginal/split/tabbed/ids defaults)
3. Optional: gdisplays load (displays field)
4. GetTree snapshot
5. Match + claim roles (each window ≤ 1 role)
6. Diff slots vs claimed homes → plan:
     - open missing
     - move wrong mon/group
     - ensure tabbed/hsplit structure (logical slots)
     - keep coexist companions (roleOrder first)
     - park residuals into overflow
7. If --dry-run: print plan; exit
8. Apply (+ optional settle focus / tab chrome)
9. Report counts + per-role outcome
```

---

## Architecture

```text
shellrc configs/forge/workon/hosts/<host>/<name>.json
        │
        ▼
forge workon <name> [--dry-run]
        │
        ├─ resolve profile (host → common → XDG)
        ├─ normalize (sugar → v2 IR)          # WR10
        ├─ workon_plan.py (pure): tree + IR → actions[]
        ├─ execute: launch gaps | RunSteps moves/layouts
        └─ report JSON + human stderr lines
```

| Layer | Owns |
| --- | --- |
| Pure normalize | Tiles sugar, defaults, id de-dupe — **unit tests** |
| Pure planner | Match, claim, structure, coexist, overflow — **unit tests** |
| CLI | Resolve paths, displays, dry-run, apply, report |
| Extension | Focus/Move/Layout/RunSteps — no new DBus unless required |

---

## Task table (by usefulness — implement this order)

| ID | Task | Status | Effort | Why this order |
| --- | --- | --- | --- | --- |
| **WR0–WR5** | Locks, planner, resolve, apply, black v2, UX | **Done** | — | Shipped base |
| **WR10** | Compact **tiles sugar** → normalize to v2 IR; unit tests; example | **Done** | M | [completed](./forge-workon-reconcile/completed/forge-workon-reconcile_wr10-tiles-sugar.md) |
| **WR11** | **Marginal coexist** + `roleOrder: first` + logical atomic slots | **Done** | M | [completed](./forge-workon-reconcile/completed/forge-workon-reconcile_wr11-marginal-coexist.md) |
| **WR12** | shellrc `hosts/black/dev.json` → sugar + README | **Done** (shellrc uncommitted) | S | [completed](./forge-workon-reconcile/completed/forge-workon-reconcile_wr12-shellrc-dev-sugar.md) |
| **WR13** | Docs/help/examples: sugar defaults, coexist, floating | **Done** | S | [completed](./forge-workon-reconcile/completed/forge-workon-reconcile_wr13-docs.md) |
| **WR14** | Post-`workon` **tab click / focus settle** | **Done** | S | [completed](./forge-workon-reconcile/completed/forge-workon-reconcile_wr14-tab-settle.md) |
| **WR15** | `--clean` / `--clean --force` (residuals only) | **Done** | S | [completed](./forge-workon-reconcile/completed/forge-workon-reconcile_wr15-clean.md) |
| **WR6** | Live black: empty / perfect / messy + companions | **Done** | S | [completed](./forge-workon-reconcile/completed/forge-workon-reconcile_wr6-live.md) |
| **WR7** | `forge workon capture` sketch from tree | **Done** | M | [completed](./forge-workon-reconcile/completed/forge-workon-reconcile_wr7-capture.md) |
| **WR8** | stableKey mon names (T7) in profiles | **Done** | S | [completed](./forge-workon-reconcile/completed/forge-workon-reconcile_wr8-stablekey.md) |
| **WR9** | shellrc env snippet `FORGE_WORKON_DIR` | **Done** | S | [completed](./forge-workon-reconcile/completed/forge-workon-reconcile_wr9-env.md) |

**Active task files:**

| Task | Path |
| --- | --- |
| WR6–WR8, WR10–WR15 | [completed/](./forge-workon-reconcile/completed/) |

**Next A/B:** none on this plan — complete. Residual roleOrder optional.

---

## Acceptance (done when — full plan)

1. **Empty workspace:** `forge workon dev` builds dual-mon target layout.  
2. **Already perfect:** second run opens **0** apps; report “nothing to do” / only no-ops.  
3. **Partial:** missing Grok only → one launch; existing tiles reused.  
4. **Messy / doubled:** extras residual-parked or kept; roles filled without third Gmail if two exist.  
5. **Companions:** Nautilus in Ghostty slot / social in left tab **kept** under default coexist.  
6. **Sugar profile:** black `dev` expressible as short `tiles` JSON; desugars equal to prior IR intent.  
7. **Host resolve:** profile from shellrc `hosts/black/dev.json` when env pointed there.  
8. **`--dry-run`:** shows plan; no mutations.  
9. Unit tests for normalize + planner without Shell; smoke on live install.

---

## Non-goals (near term)

- Closing/killing as default  
- Spatial nearest-slot residual as default  
- Full session-layout / pixel restore of every window  
- GUI profile editor  
- i3-level marks/scratchpads  
- Replacing shellrc `workon` name (always **`forge workon`**)  
- Process-kill or “windows without processes” heuristics  
- New DBus methods unless Move/Layout prove insufficient  

---

## Dependency graph

```text
WR1–WR5 (shipped)
    │
    ▼
WR10 tiles sugar normalize ──► WR12 shellrc dev sugar
    │                              │
    ▼                              │
WR11 marginal coexist ─────────────┤
    │                              │
    ▼                              ▼
WR13 docs/help ◄───────────────────┘
    │
    ├─► WR14 tab settle (can parallel if repro)
    └─► WR6 live accept
              │
              └─► WR15 --clean (optional)
```

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Chrome windows hard to tell apart | Sugar allows rich cells; prefer PWA titles; refine matchers live |
| Sugar ambiguous nests | Prefer explicit `{ split, content }` when array nest unclear |
| Weak match from open token only | Dry-run shows match; document rich object escape |
| Structure repair thrash with coexist | Reorder-in-place; promote singleton carefully |
| Tab chrome dead after mass move | WR14 settle pass |
| shellrc vs forge split | WR12 in shellrc; forge tests use in-tree examples |

---

## Docs to update when implementing

- `docs/DESIGN.md` — sugar + coexist durable why  
- `docs/user/workon.md` — authoring sketch first  
- `scripts/forge/README.md` + `forge workon help`  
- shellrc `configs/forge/workon/README.md` + `hosts/black/dev.json`  
- `agents/PRIORITY.md`  

---

## Open product choices (mostly locked)

1. **Overflow:** primary tabbed overflow — keep.  
2. **Two Ghostties:** claim by mon preference — keep.  
3. **Root key name:** `tiles` preferred for sugar; IR uses `layout` after normalize.  
4. **Nearest residual / process heuristics:** deferred.  

---

## Next task

**None** — plan complete. Optional residual: mon1 tab `roleOrder` settle.
Regression watch outranks polish if thrash returns.
