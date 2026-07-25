# Plan: `forge` CLI + session scripting surface

**Status:** FC0–FC4 **Done** — FC5 deferred
**Priority:** P1 product (next after daily-driver Phase E)  
**Base:** this tree (`jcrussell/forge`)  
**Related:** [forge-daily-driver.md](./forge-daily-driver.md) (OP1, T6–T7 done),  
[forge-harden-and-session.md](./forge-harden-and-session.md) (DBus / apply runtime)

### Session note (2026-07-25)

**FC0–FC4 Done (A/B AGREE each).** DBus control plane + forge CLI: ping, tree,
focus/swap/move, launch+PlaceNext, settings get/set/profiles, run-steps with
freezeRender. apiVersion 5; ~1836 unit tests. **FC5 workon deferred design.**

**Live smoke + follow-ups (2026-07-25):** ping/tree/focus/move/swap/get/set/
settings save|load/run-steps **OK**. Fixed launch wait `path:null` (CLI path
annotation), case-insensitive `wmClass` (CLI wait, place-hint, `class:`
selectors), and human-friendly `forge launch` (short names, auto desktop +
wm_class, `--path` alias). Install reloads Shell so extension casefold is live.

---

## Goal

1. One user-facing binary: **`forge`** — inspect tree, launch/place windows,
   swap/move tiles, tweak settings, save/load profiles.  
2. Extension exposes a **stable IPC** (prefer DBus) that the CLI calls; no
   production dependence on `Shell.Eval`.  
3. Atomic ops match keybind command surface so scripts and hands share one
   engine.  
4. **`workon <name>`** (later) = thin wrapper: display scene + `forge` steps.

**Non-goals (MVP):** full i3 IPC parity; live GUI recorder; inventing
`workon` DSL before `forge` exists.

---

## Product locks (2026-07-25)

| Topic | Decision |
| --- | --- |
| CLI name | `forge` with subcommands |
| Defaults for launch | `--last-focused` attach; monitor follows LFT (or explicit `--monitor`) |
| Dock vs terminal | Dock sticky-to-dock-mon is **shell open-app policy** (OP1; uses **per-mon LFT**). Terminal/script without flags use **global LFT** — terminal location is not intent. Explicit place via `forge launch …`. |
| Tile selection | Multiple matchers: title, wmClass, tree path, composite |
| Settings | Get/set/save via CLI (portable config-sync keys) |
| `workon` | **After** forge CLI shapes up — separate task, not designed yet |

---

## Command sketch (evolve in implementation)

```text
forge launch <app-or-desktop-id> [options]
  --monitor=<index|role|primary>   # optional; default: LFT's mon, else mon 0
  --last-focused                   # default attach: after LFT (tab/aspect rules)
  --tree-path=<path>               # explicit insert target (overrides LFT)
  --wm-class=…                     # wait/match after launch
  --no-wait / --timeout=ms

forge swap <tile-a> <tile-b>
forge move <tile> <dest>           # dest = tree-path | tile | monitor+path
forge focus <tile>
forge layout <tabbed|hsplit|vsplit|stacked> [--tile=…]
forge tree [--monitor=…] [--json]  # dump structure (debug + scripting)
forge get <gsetting-key>
forge set <gsetting-key> <value>
forge settings save|load <name>    # config-sync profiles
forge ping
```

### Tile selectors (shared grammar)

Examples (exact grammar TBD in C1):

| Form | Meaning |
| --- | --- |
| `title:Grok` / `title~=chrome` | Title exact / substring / regex |
| `class:Google-chrome` | `wm_class` |
| `path:left/0/1` or `mo0ws0/c0/w1` | Tree path from mon role or node id |
| `focus` / `lft` | Current focus / LFT |
| `class:Ghostty@left` | Class on a monitor role |

Ambiguous matches: fail with candidates list (non-interactive) or pick first
with `--first` only when forced.

### Launch defaults

```text
forge launch google-chrome
  → attach after LFT using OP1 tab/aspect rules
  → monitor = LFT's monitor; if no LFT → monitor 0 (first)

forge launch google-chrome --monitor=right --tree-path=…
  → explicit; ignores LFT for placement
```

Interactive dock launches stay in extension open-app policy (OP1), not CLI.

---

## Architecture

```text
forge (CLI, Node or zsh+python) 
    → DBus org.gnome.Shell.Extensions.Forge (or similar)
        → session-api.js / CommandHandler / tree
```

| Layer | Owns |
| --- | --- |
| CLI | parse args, launch processes, wait for wmClass, pretty print |
| DBus | GetTree, RunOp/RunSteps, Place, Ping, settings passthrough |
| Extension | tree mutations, OP1 attach rules, freezeRender batch |

Reuse e2e `_forgeTestBridge` shapes for GetTree projection; do not ship Eval.

---

## Dependency graph

```text
OP1 open-app policy (LFT MRU + dock sticky)
        │
        ▼
T6 tree snapshot ──► T7 stable mon roles
        │
        ▼
FC0  DBus Ping + GetTree
        │
        ▼
FC1  tile selectors + forge tree / focus / move / swap
        │
        ▼
FC2  forge launch (wait + place)
        │
        ▼
FC3  forge settings get/set/save/load
        │
        ▼
FC4  forge run-steps / batch (freezeRender)   ← morning scripts without workon DSL
        │
        ▼
FC5  workon composition  (DEFERRED design — after FC1–FC4 exist)
```

---

## Task table

| ID | Task file | Status | Depends | Effort | Outcome |
| --- | --- | --- | --- | --- | --- |
| **FC0** | [completed/…](./forge-command/completed/forge-command_fc0-dbus-get-tree.md) | **Done** | T6 preferred | M | DBus Ping + GetTree; CLI stub |
| **FC1** | [completed/…](./forge-command/completed/forge-command_fc1-selectors-move-swap.md) | **Done** | FC0; T7 soft | M | Selectors; tree/focus/move/swap |
| **FC2** | [completed/…](./forge-command/completed/forge-command_fc2-launch.md) | **Done** | FC1; OP1 | M | `forge launch` + wait/place |
| **FC3** | [completed/…](./forge-command/completed/forge-command_fc3-settings.md) | **Done** | FC0 | S–M | get/set/save/load settings |
| **FC4** | [completed/…](./forge-command/completed/forge-command_fc4-run-steps.md) | **Done** | FC1–FC2 | M | Batched ops, quiet render |
| **FC5** | `agents/tasks/forge-command_fc5-workon.md` | **Deferred design** | FC1–FC4 | S–M | `workon` wrapper syntax — design only after forge CLI is real |

When creating task files, use daily-driver task structure (problem, goals,
acceptance, code touch list, tests).

---

## Relationship to harden Phase 3

[forge-harden-and-session.md](./forge-harden-and-session.md) Phase 3
**defers to this plan** for user-facing command shape. Harden still owns
in-process `RunSteps` / freezeRender if built under the extension; CLI is the
shell.

---

## Next agent playbook

```text
1. Do not start FC* until OP1 is done (and ideally T6/T7).
2. Prefer small FC0 proof (Ping/GetTree) before launch complexity.
3. Do not invent workon DSL in FC0–FC4 — leave FC5 empty design until asked.
4. Update this plan session note after each FC task.
```
