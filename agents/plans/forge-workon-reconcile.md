# Plan: Idempotent `forge workon` (desired-state layout)

**Status:** WR1–WR5 **Done** — next **WR6** live black trials  
**Priority:** **P1 product** (day-to-day #3 after live regression watch)  
**Base:** this tree; builds on [forge-command.md](./forge-command.md) FC0–FC5  
**Related:** OP1 open-app, T6 GetTree, shellrc `gdisplays` host layout  

### Session note (2026-07-26)

**WR1–WR5 Done (A/B AGREE).** Live dry-run on black (no apply):
`forge workon dev --dry-run` → reused 6 / opened 1 (`chrome-luke` exact
title miss) / parked 2. WR6 still needs live apply accept (empty / perfect /
messy). Chrome matcher may need WR4 follow-up during WR6. CLI: dry-run is
**only** `--dry-run` (no `workon plan` alias).

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
> parked, not destroyed. I never babysit tiles for ten minutes.

### UX principles

| Principle | Concrete |
| --- | --- |
| **Idempotent by default** | Second `forge workon dev` ≈ no-op if already satisfied |
| **Reuse before open** | Match existing tiles; launch only gaps |
| **Never surprise-kill** | Surplus → park (overflow), not close |
| **Visible plan** | `--dry-run` prints reused / open / move / park before apply |
| **Honest report** | JSON summary after run (counts + role → window) |
| **Fast enough** | Sub-second plan; apply dominated by any needed launches |
| **Host-aware configs** | Same profile *name* can differ per machine (mon count, apps) |
| **One place for many machines** | Profiles versioned in shellrc; not only `~/.config` on one box |
| **Discoverable** | `forge workon list` shows host + which file won |
| **Escape hatch** | `--force-launch` keeps imperative FC5 path for debug |

### Feel of a good morning

```text
$ forge workon dev
forge workon: host=black profile=dev
  reused  6   opened  0   moved  1   parked  2
  ok

$ forge workon dev          # already perfect
forge workon: nothing to do (6 roles satisfied)
```

Bad morning (today): double Grok, double Gmail, four Ghostties, path soup.

### What humans should *not* need to know

- Tree path indices (`mo0ws0/1/0`)
- Whether a PWA reports `crx_*` vs `Google-chrome`
- Whether Chrome profile dir is `Default`
- Order of aspect-split vs tab layout ops

They declare **roles + shape**; the planner owns structure repair.

---

## Product locks

| Topic | Decision |
| --- | --- |
| Default mode | **Reconcile** (desired state), not imperative steps |
| FC5 steps | Still supported (`version: 1` / `mode: steps`) for scripts |
| Schema | `version: 2` + `mode: "reconcile"` (or omit mode → reconcile when `roles` present) |
| Matching | Role matchers claim **at most one** window each (global claim set) |
| Missing role | Launch via existing `open` / `app` once, then place |
| Extra copies of a role | First claim wins; extras → unclaimed → overflow |
| Non-role windows | **Park** per overflow policy (never kill in v1) |
| Already perfect | No spawn; minimal or zero tree mutations |
| Overflow default | Tabbed **overflow** group on primary monitor (rightmost sibling) — revisit if bad |
| Dry-run | `--dry-run` |
| Force old behavior | `--force-launch` or profile `mode: "steps"` |

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
| Planner + executor | **Forge** (`scripts/forge/`, pure lib + CLI) |
| Profile JSON per host | **shellrc** `configs/forge/workon/hosts/<host>/` |
| Shared templates | shellrc `configs/forge/workon/common/` |
| Env | `FORGE_WORKON_DIR`, `FORGE_HOST` (like `GDISPLAYS_HOST`) |

### shellrc layout (proposed)

```text
~/dev/me/shellrc/configs/forge/workon/
  README.md
  common/
    dev.json                 # optional shared baseline
  hosts/
    black/
      dev.json               # dual 4K morning layout
      rec.json               # optional recording layout
    green/                   # another machine
      dev.json               # different mon count / apps
```

**Why hostname folders**

- One git repo for all machines (like displays).
- `dev` on `black` ≠ `dev` on a laptop.
- Copy/adapt profiles without polluting live `~/.config` until loaded.

**Install / discover**

- shellrc may export `FORGE_WORKON_DIR=$shellrc/configs/forge/workon` from a small
  `shell-sources` snippet (same pattern as gdisplays).
- Without shellrc, XDG `~/.config/forge/workon/` still works (FC5 compat).

**Not in this plan’s critical path:** auto-sync or install hooks — document
env + layout; shellrc wires env when convenient.

---

## Desired-state model (roles + shape)

### Role

```json
{
  "id": "grok",
  "match": {
    "class": "Google-chrome",
    "title~=": "Grok"
  },
  "open": {
    "app": "Grok",
    "wmClass": "Google-chrome",
    "timeout": 25000
  },
  "slot": "mon0.left-tab"
}
```

| Field | Meaning |
| --- | --- |
| `id` | Stable name for reports |
| `match` | Selector grammar subset (class, title, title~=, class@mon, …) |
| `open` | Same as today’s launch fields; used only if no match |
| `slot` | Named place in `layout` |

### Layout shape (slots)

```json
{
  "version": 2,
  "mode": "reconcile",
  "description": "Dual-mon morning on black",
  "displays": "default",
  "overflow": { "slot": "mon0.overflow", "layout": "tabbed" },
  "layout": {
    "mon0": {
      "split": "hsplit",
      "children": [
        { "id": "left-tab", "layout": "tabbed", "roles": ["chrome-luke", "grok"] },
        { "id": "term", "roles": ["ghostty-left"] }
      ]
    },
    "mon1": {
      "split": "hsplit",
      "children": [
        { "id": "term", "roles": ["ghostty-right"] },
        { "id": "comms", "layout": "tabbed", "roles": ["youtube", "gmail", "voice"] }
      ]
    }
  },
  "roles": [ /* … */ ]
}
```

Monitor keys: `mon0` / `mon1` / `primary` / later T7 stableKey aliases.

### Black `dev` (target)

| Slot | Roles |
| --- | --- |
| mon0 left tab | Chrome (lukebmay / main browser), Grok PWA |
| mon0 right | Ghostty |
| mon1 left | Ghostty |
| mon1 right tab | YouTube, Gmail, Google Voice PWAs |
| overflow | Everything else |

---

## Algorithm

```text
1. Resolve profile path (host search order)
2. Optional: gdisplays load (displays field) — same as FC5
3. GetTree snapshot
4. Match + claim roles (each window ≤ 1 role)
5. Diff slots vs claimed homes → plan:
     - open missing
     - move wrong mon/group
     - ensure tabbed/hsplit structure
     - park unclaimed into overflow
6. If --dry-run: print plan; exit
7. Apply:
     - launches (CLI) then wait
     - batch move/layout via RunSteps (freeze once where possible)
8. Report counts + per-role outcome
```

**Complexity:** O(windows × roles) — fine for tens of windows.  
**Hard parts:** Chrome multi-window match quality; tab CON repair; two Ghostties
(claim set). Not hard: runtime cost.

---

## Architecture

```text
shellrc configs/forge/workon/hosts/<host>/<name>.json
        │
        ▼
forge workon <name> [--dry-run]
        │
        ├─ resolve profile (host → common → XDG)
        ├─ workon_plan.py (pure): tree + profile → actions[]
        ├─ execute: launch gaps | RunSteps moves/layouts
        └─ report JSON + human stderr lines
```

| Layer | Owns |
| --- | --- |
| Pure planner | Match, claim, structure diff, overflow — **unit tests, no Shell** |
| CLI | Resolve paths, displays, dry-run, apply, report |
| Extension | Existing Focus/Move/Layout/RunSteps/PlaceNext only — **no new DBus in v1** if possible |

Reuse FC1 selectors and FC4 RunSteps. Prefer **no new Mutter API** for the MVP.

---

## Task table

| ID | Task | Status | Effort | Outcome |
| --- | --- | --- | --- | --- |
| **WR0** | Product locks + schema sketch in DESIGN; overflow default | **Done** (this plan) | S | Shared language |
| **WR1** | Pure planner: match/claim/diff → actions; fixtures from real trees | **Done** | M | `workon_plan.py` + tests |
| **WR2** | Profile resolve: host/common/XDG + `FORGE_WORKON_DIR` / `FORGE_HOST` | **Done** | S | list/show show path source |
| **WR3** | Executor: apply plan (launch gaps + RunSteps); dry-run | **Done** | M | `forge workon` reconcile path |
| **WR4** | Migrate `dev` to v2 roles; shellrc `hosts/black/dev.json` + README | **Done** | S | Real daily profile |
| **WR5** | UX: human summary, dry-run, list/show host tags; docs | **Done** | S | Morning-proof CLI |
| **WR6** | Live on black: empty + already-perfect + messy tree trials | Ready | S | Acceptance |

Optional later:

| ID | Idea |
| --- | --- |
| WR7 | `forge workon capture dev` — sketch roles from current tree (assist authoring) |
| WR8 | stableKey mon names from T7 in profiles |
| WR9 | shellrc install env snippet + `agents` docs cross-link |

---

## Acceptance (done when)

1. **Empty workspace:** `forge workon dev` builds dual-mon target layout.  
2. **Already perfect:** second run opens **0** apps; report “nothing to do” / only no-ops.  
3. **Partial:** missing Grok only → one launch; existing tiles reused.  
4. **Messy / doubled:** extras parked; roles filled without a third Gmail if two exist.  
5. **Host resolve:** profile from shellrc `hosts/black/dev.json` when env pointed there.  
6. **`--dry-run`:** shows plan; no mutations.  
7. Unit tests for planner without Shell; smoke on live install.

---

## Non-goals (v1)

- Closing or killing windows  
- Full session-layout / pixel restore of every window  
- GUI profile editor  
- i3-level marks/scratchpads  
- Replacing shellrc `workon` name (always **`forge workon`**)  
- New DBus methods unless Move/Layout prove insufficient  

---

## Dependency graph

```text
FC0–FC5 (shipped)
    │
    ▼
WR1 pure planner ──► WR3 executor
    │                    │
WR2 path resolve ────────┤
                         ▼
              WR4 black dev profile + shellrc tree
                         │
                         ▼
              WR5 UX/docs ──► WR6 live accept
```

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Chrome windows hard to tell apart | Prefer PWA titles; main browser = “Chrome” title / not PWA titles; document matchers |
| Structure repair wrong (tab whole mon) | Planner builds explicit tab CONs; tests from messy-tree fixtures |
| gdisplays load disruptive | Keep optional; default profiles may omit `displays` |
| Host mismatch (`black` vs container) | `FORGE_HOST` override; list shows resolved host |

---

## Docs to update when implementing

- `docs/DESIGN.md` — durable “why reconcile”  
- `docs/user/` — short workon UX page  
- `scripts/forge/README.md` — resolve order + flags  
- shellrc `configs/forge/workon/README.md` — host layout (shellrc commit separate)  
- `agents/PRIORITY.md` — keep this as P1 until WR6 done  

---

## Open product choices (defaults above; change only if wrong)

1. **Overflow:** tabbed group on primary vs spare workspace vs float — **default: primary tabbed overflow**.  
2. **Two Ghostties:** roles `ghostty-left` / `ghostty-right` same match class, claim order by current mon preference then any.  
3. **Main Chrome:** match non-PWA Chrome on Default profile heuristic vs explicit title list — refine in WR4 with live titles.

---

## Next task

**WR6** — live accept on black (empty / already-perfect / messy). Do not
start while thrash is open.
