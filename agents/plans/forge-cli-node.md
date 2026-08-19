# Plan: Gradual `forge` CLI Python → Node

**Status:** **locked** (operator 2026-08-14) — implement CN0–CN6 after
TD1; **do not** port layout here  
**Priority:** after tab-strip TD1 + live residuals  
**Branch:** `master`  
**Decision:** [D036](../../docs/DECISIONS.md) · layout apply [D037](../../docs/DECISIONS.md)  
**D0 notes:** [completed D0](./forge-cli-node/completed/forge-cli-node_d0-discussion.md)  
**Layout apply (separate):** [forge-layout-in-process](./forge-layout-in-process.md)  
**Tab strip (ahead of this):** [forge-tab-chrome-drag](./forge-tab-chrome-drag.md)  
**Created:** 2026-08-14  
**Updated:** 2026-08-14

This plan is the implementer spec for **non-layout CLI**. Orchestrators
must follow [Which agent](#which-agent) and the campaign order in
[PRIORITY](../PRIORITY.md). Stop if a slice would reshape the plan —
that is 4.6 xhigh work, not a 4.5 implement session.

---

## Goal

1. User-facing `forge` stays the same (`forge <cmd> …` on PATH).
2. Product logic that prefs / extension / CLI all need lives **once**, as
   **pure ESM** under `lib/shared/` (and a few already-pure
   `lib/extension/` helpers).
3. CLI bodies move to **Node** under `cli/`, piecewise.
4. Prefs and the extension stay **GJS facades** over the same pures. They
   do **not** shell out to `forge` for Save/Load.
5. Python CLI shrinks until it is gone. Zsh **install** scripts stay in
   `scripts/`.

## Non-goals

- Big-bang rewrite of `layout` / nest / jobs / live matrix.
- TypeScript, a bundler, or new runtime npm deps (`dbus-next`,
  `commander`, `chalk`, `yargs`).
- Making prefs/extension import `cli/`.
- Making Node import `gi://` or GJS-only files.
- Porting `layout_plan.py` / `layout_apply.py` into `cli/` (would be
  thrown away when apply moves in-process).
- In-process `ApplyLayout` **in this plan**. That is
  [forge-layout-in-process](./forge-layout-in-process.md) — 4.6 xhigh
  designs it; this CLI plan only grows a thin client **after** that
  ships.
- Renaming zsh install helpers (`build-install.zsh`, `migrate-from-ego`,
  …) into `cli/`.
- Flipping root `package.json` `"type": "module"` unless a dedicated
  slice proves `npm test` + husky still pass.

---

## Value (why do this)

The win is **one product kernel**, not a faster interpreter.

Today:

- Extension + prefs are GJS/JS. Control CLI is ~24k LOC Python
  (`scripts/forge/forge` 7k + modules) plus ~15k LOC pytest.
- Dual implementations already drifted (keybind save/load policy vs
  prefs). Python `keybind_kit.py` shells out to Node solely to
  `import` `lib/shared/keybind-presets.js`.
- `partition_mixed_steps` (Python) mirrors `partitionMixedSteps` (JS).
- Settle formula exists twice (`settle-math.js` ≈
  `settle_heuristics.py`).
- `rival-tilers.js` is copied into `_lib.zsh`.

Moving the CLI to Node is how CLI and GUI stop being two products.

What it does **not** buy:

- Faster `forge layout`. See below.
- Less code on day one. The first slices **add** a Node body + a thin
  Python exec shim, then delete the Python body. Net drop comes later.
- An excuse to rewrite the planner. `layout_plan.py` is 5.5k LOC with
  6.3k LOC of tests. A “clean rewrite” will regress. Port with
  **golden-file parity**.

**Do the non-layout part.** After lock: CN0–CN2 (keybind) when it does
not steal the tab-chrome files. **Never** start a layout_plan JS port
under this plan — see [Where layout work goes](#where-layout-work-goes).

---

## Where layout work goes

**Do not port the planner into `cli/`.** That is duplicate work.

Cold `forge layout` is slow because of app map + D019 waits + GetTree
polls, not because of Python. The fix is **one DBus `ApplyLayout`**:
the extension runs the spine on Meta signals. Design and implement
that under [forge-layout-in-process](./forge-layout-in-process.md)
(**4.6 xhigh** design lock first).

| Work | Home | When |
| --- | --- | --- |
| Planner + apply spine | JS next to the tree (`lib/shared` pures + `lib/extension` executor) | After tab TD1 + live residuals; after in-process **design** lock |
| CLI `forge layout` | Thin Node client: load profile JSON, call ApplyLayout, stream status | After ApplyLayout exists (replaces CN8–CN12) |
| IC4 fold CLI waiters | **Skip** if ApplyLayout deletes those waiters | Do not spend a 4.5 session on IC4 now |
| Python `layout_*.py` | Stay until ApplyLayout replaces them | Do not golden-port to `cli/` first |

CN8–CN12 in the slice list below are **cancelled as written**. They
remain only as a historical outline of what *not* to start.

## Shared kernel (`lib/shared/`)

**Yes, we already have the directory. Do not add `pures/`, `lib/pure/`,
or a second `shared/`.**

| Path | Meaning |
| --- | --- |
| `lib/shared/` | Product kernel imported by **prefs + extension + (later) Node CLI** |
| Rule (FIRM after lock) | **No `gi://`, no `node:`, no `process`, no `fs`** in new `lib/shared/` files |
| `lib/prefs/`, `lib/extension/` | GJS facades (Gio, Meta, St, Clutter) |
| `cli/` | Node facades (`fs`, `gsettings`, `gdbus`) |
| `scripts/forge/*.zsh` | Install plane — not the kernel |

`lib/shared/` today is **mixed**. Vitest can import Gio files because
`tests/setup.js` mocks `gi://`. Real Node cannot.

**Do not** mass-move `settings.js` / `config-sync.js` / `theme.js` /
`logger.js` in the first CLI slices (import churn, no user value).
Extract **pures beside** the GJS file; leave the Gio class where it is
until a later optional `lib/host/` move (only if agents keep importing
the wrong file).

### Extract inventory (opportunistic — not a campaign)

Pull a pure out **when the next consumer needs it**, in that slice.
Do not schedule a “make everything pure” taskforce.

| Source | Already pure? | Extract | First consumer |
| --- | --- | --- | --- |
| `keybind-presets.js`, `settings-keys.js`, `settings-control.js`, `keybind-conflicts.js`, `gnome-overrides.js`, `rival-tilers.js` | Yes | — | CN2 / prefs (already) |
| `forge-config-home.js` | No (`gi://GLib`) | `resolveForgeConfigHome({ env, userConfigDir })` in `lib/shared/paths.js` | CN3 |
| `settings.js` ConfigManager | No (Gio) | None now. Sanitize/reserved already in presets | — |
| `config-sync.js` | No (GLib timeouts) | Portable JSON build/parse only if CN5 settings needs it | CN5 |
| `theme.js`, `logger.js` | No | Never for CLI | — |
| `_lib.zsh` rival UUID list | Duplicate of `rival-tilers.js` | Zsh MAY keep a comment pointer; do not invent a zsh importer | optional hygiene |
| `lib/extension/settle-math.js` | Yes | Move to `lib/shared/` when ApplyLayout or a Node store needs it | in-process apply |
| `lib/extension/run-steps.js` `partitionMixedSteps` | Yes | Import from extension in CN6, **or** move to `lib/shared` in that slice | CN6 |
| `drop-intent.js`, `layout-verify.js`, `layout-sensors.js`, drop-zone geometry | Yes | Stay in extension until ApplyLayout wants them | GUI / apply |
| `layout_plan.py` / `layout_apply.py` | Python | **Not** into `cli/`. Become JS pures + extension executor under in-process apply | 4.6 xhigh plan |
| `tree.js` Node | GJS + Meta | Do not extract. Tree stays in the Shell | — |

Pattern (same as CN3):

```js
// lib/shared/paths.js  — pure
export function resolveForgeConfigHome({ env, userConfigDir }) { /* */ }

// lib/shared/forge-config-home.js — GJS wrapper, keep the name
import GLib from "gi://GLib";
import { resolveForgeConfigHome } from "./paths.js";
```

Prefs and the extension keep calling the wrapper. Node CLI imports the
pure.

## Which agent

Spawn `model` slugs: `grok-4.5` or `grok-4.6`. There is no separate
“medium” slug — put the **role in the prompt** (mechanical vs implement
vs do-not-redesign).

| Role | `model` | Prompt as | This plan |
| --- | --- | --- | --- |
| Orchestrator / plan reshape | `grok-4.6` | 4.6 xhigh; no implement | Open questions, ApplyLayout lock, slice reorder |
| Default implement | `grok-4.5` | 4.5 medium; one CN; follow FIRM | CN0–CN6 |
| Mechanical only | `grok-4.5` | 4.5 low; no new files beyond the list | CN0 smoke, expected dumps, doc path updates |
| Hard implement / review | `grok-4.6` | review named APIs + tests | After CN2; after first DBus adapter |
| ApplyLayout design | `grok-4.6` | 4.6 xhigh; design only | **Not this plan** |
| Layout planner port | `grok-4.6` | after ApplyLayout lock | **Not this plan** |

**FIRM for orchestrators:** do not assign CN8–CN12, IC4, or
`layout_plan` work to any 4.5 agent. If a 4.5 session hits a plan
reshape, it stops and writes a blocker.

---

## Current map (do not rediscover)

```text
~/.local/bin/forge → $repo/scripts/forge/forge   # python3, 7031 lines
                      argparse → args.func(backend, args)

scripts/forge/*.py     # product CLI (~24k LOC)
scripts/forge/*.zsh    # install / migrate / theme (stay here)
lib/shared/*.js        # mixed: some pure, some gi://
lib/prefs/             # GTK; already imports keybind-presets.js
lib/extension/         # GJS product; session-api DBus
```

| Module | ~LOC | Coupling | First? |
| --- | --- | --- | --- |
| `keybind_kit.py` | 869 | Low. gsettings/files. Install calls it by path. Product truth already JS | **Yes (CN2)** |
| `cli_help` / `cli_ansi` | small | Presentation | With Node router |
| `job_runner.py` | 1215 | High. Re-execs **this** `forge` as worker | Design before mutators move (CN7/CN12) |
| `layout_plan.py` | 5490 | Pure but huge | **Last product port (CN10)** |
| `layout_apply.py` | 2041 | Pure waiters + spine helpers | After plan (CN11) |
| `layout_save.py` / `layout_lib.py` / `layout_cli.py` | medium | Files + GetTree | Before apply (CN8) |
| `settle_heuristics.py` | 732 | File store; formula twin of `settle-math.js` | With apply or just before (CN9) |
| `nested_wayland.py` | 1596 | Dev harness | Late (CN14) |
| `live_matrix.py` | 1896 | Dev harness | Late (CN14) |
| `forge` body | 7031 | DBus + many cmds | Per-command |

`lib/shared` **is not all Node-safe**. Proven 2026-08-14 (Node 24.3):

| File | Node import? |
| --- | --- |
| `keybind-presets.js`, `settings-keys.js`, `settings-control.js`, `rival-tilers.js`, `keybind-conflicts.js`, `gnome-overrides.js` | **Yes** (pure) |
| `lib/extension/settle-math.js` | **Yes** (pure) |
| `lib/extension/run-steps.js` (`partitionMixedSteps`) | **Yes** (pure; file says no Gio/Meta) |
| `forge-config-home.js`, `settings.js`, `config-sync.js`, `theme.js`, `logger.js` | **No** (`gi://` → `ERR_UNSUPPORTED_ESM_URL_SCHEME`) |

Vitest can import the GJS files because `tests/setup.js` mocks `gi://`.
The real Node CLI cannot.

---

## Target architecture

```text
                    ┌─ lib/prefs/*          (GJS adapters: Gio.Settings)
 GUI facades ───────┤
                    └─ lib/extension/*      (GJS adapters: Meta, DBus)

                         │ import pures only
                         ▼
                    lib/shared/*.js         # NO gi://  (after CN3)
                    lib/extension/settle-math.js
                    lib/extension/run-steps.js   # partition / schema only

                         ▲ import pures only
                         │
 CLI facade ──────── cli/*                  (Node adapters: fs, gsettings, gdbus)
                         │
                         ▼
              ~/.local/bin/forge
                Phase A: scripts/forge/forge (Python router) execs node cli/…
                Phase B: cli/forge.mjs (Node router) execs leftover Python
```

**Right model:** shared **policy**, different I/O.

**Wrong model:** prefs `spawn("forge keybind save")`. GUI must keep
calling pures + Gio, same as today.

### Directory end-state

| Path | Owns |
| --- | --- |
| `cli/` | Node control CLI (new). Destination name for the Python CLI |
| `cli/README.md` | How to add a command; import rules |
| `scripts/forge/*.zsh` + `_lib.zsh` | Install / migrate / theme — **stay** |
| `scripts/forge/examples/` | Move with layout (CN8), not before |
| `scripts/install.zsh` | Root `./install` — stays |

Do **not** rename `scripts/` wholesale. Only the **control CLI** moves
to `cli/`.

---

## FIRM for every implementer

1. **One slice per session** unless the task file batches two tiny ones
   (CN0+CN1 is the only allowed pair).
2. **Do not start CN8+** (layout list/plan/apply) under this plan.
   Layout lives in [forge-layout-in-process](./forge-layout-in-process.md).
   Do not start CN4+ until CN2 has shipped **and** tab TD1 is not
   using the same session (file overlap is small, but queue is not).
3. **No `gi://` in `cli/`.** If you need a helper that imports GLib,
   extract a pure function first (CN3 pattern).
4. **No new npm runtime dependencies.** DevDeps stay as they are
   (vitest, prettier). Host tools: `node` ≥ 20, `gdbus`, `gsettings`,
   `dconf` — already required for this stack.
5. **No TypeScript.**
6. **Delete the Python body** in the same slice that the Node body
   reaches parity. A port that leaves both implementations is a
   **failed** slice.
7. **Keep `forge <cmd>` argv / stdout / stderr / exit codes.** Golden:
   existing pytest + a CLI smoke. If you must change a contract, stop
   and ask.
8. **Missing `node`:** print the tool name + install hint; exit **127**
   (`scripting.md`).
9. **Job runner:** `worker_argv` is an opaque argv list. Do not hard-code
   “always Python” in new code. Do not port `job_runner.py` until a
   **mutating** command is Node (CN12).
10. **Install ours-detection** (`forge_cli_bin_is_ours` in `_lib.zsh`)
    matches `*/scripts/forge/forge` today. Do not retarget
    `~/.local/bin/forge` until CN13.
11. **`lib/shared` must stay importable from GJS.** No `node:fs`,
    `process`, `child_process`, or `node:` specifiers in shared pures.
12. **Do not flip root `package.json` `"type"`** unless that is the
    slice (and `npm test` is green). Use `cli/package.json` +
    `lib/shared/package.json` with `"type": "module"` to silence
    `MODULE_TYPELESS_PACKAGE_JSON`.
13. **Comments:** short why-only (`comments.md`). No migration essays
    in source.
14. **Git:** no commit/push unless the user asks (`git.md`).

---

## Dispatch contract (CN1; used by every later slice)

Python router remains PATH entry until CN13.

```text
forge keybind load vim
  → scripts/forge/forge argparse
  → os.execv(node, [node, <repo>/cli/keybind.mjs, "load", "vim", …])
```

| Rule | Detail |
| --- | --- |
| Which argv | Everything after `forge` that belongs to that command, **including** the subcommand name (`keybind`) so the Node program can be invoked standalone as `node cli/keybind.mjs load vim` **or** `node cli/keybind.mjs keybind load vim`. Pick **one** in CN2 and test both install and `forge`. Recommended: Node argv[2+] is `load vim` (no extra `keybind` prefix) when the file **is** the command. |
| env | Inherit full env (`FORGE_*`, `DISPLAY`, `DBUS_SESSION_BUS_ADDRESS`, `FORGE_COLOR`, `FORGE_CONFIG_HOME`, `FORGE_HOST`, `FORGE_KEYBIND_PROFILES_DIR`) |
| stdio | Inherit (do not capture) so TTY color and Ctrl+C work |
| cwd | Inherit |
| exit | Node’s exit code is the CLI exit code (`os.execv` / `os.execve`) |
| replace process | Prefer `os.execv` so job workers do not leave a Python parent. If exec is impossible, `subprocess.run` + `sys.exit(rc)` is acceptable for non-job commands only |
| node path | `shutil.which("node")`; else exit 127 |
| extra node flags | None required on Node 24. Do **not** pass `--input-type=module` when the file is `.mjs` |

**Proven import (do not re-probe):**

```js
// cli/keybind.mjs — works on Node 24.3 from repo root
import { getKit, listKits, sanitizeProfileName } from "../lib/shared/keybind-presets.js";
```

### Standalone vs `forge` (keybind)

Install calls **the implementation file**, not necessarily PATH `forge`:

```zsh
# today
python3 "$FORGE_SCRIPTS/keybind_kit.py" load "$KIT"
python3 "$FORGE_SCRIPTS/keybind_kit.py" status --json
```

After CN2, install must call the Node file (or `forge keybind`, which
then execs Node). Prefer the **Node file by path** so install works
even if PATH `forge` is stale.

Exit codes to preserve (CN2):

| Command | Success | Custom live kit | Usage / error |
| --- | --- | --- | --- |
| `keybind status` | 0 (matched vim\|safe\|i3) | **2** | 1 |
| `keybind save\|load\|list\|dir` | 0 | — | 1 |
| missing node | — | — | **127** |

`status --json` stdout is the slim object (`matched`, `closest`,
`diffCount`, `hint`, `diffs`). Install parses `matched`.

---

## Job runner rules

Today (`D021`):

- Mutators: `layout` apply, `run` / `run-steps`, install family,
  `test live run`.
- Worker argv is `[sys.executable, forge_script, *user_argv]`.
- `maybe_run_as_job` already takes an opaque list.

| Phase | Rule |
| --- | --- |
| CN0–CN6 | Non-mutators only. **Do not change** worker argv. |
| CN1 | Add a comment + helper note: future workers may start with `node`. Add a unit that `spawn_worker` accepts `["/usr/bin/node", "cli/x.mjs"]` (mock Popen). Do not switch production argv. |
| CN12 (layout Node) | Worker argv for layout = Node implementation (or Node router). Single-flight / logs / HUP ignore **unchanged**. |
| CN13 | Node router builds worker argv. Python `job_runner.py` may remain as the library **or** be ported in the same slice if the router is Node. Prefer **port job_runner to Node in CN13**, not earlier. |

`keybind` is **not** a mutator job today. Keep it that way.

---

## Testing strategy

| Kind | Tool | When |
| --- | --- | --- |
| Pure policy already JS | existing Vitest (`tests/unit/shared/…`) | extend, do not fork |
| New Node adapters | `tests/unit/cli/*.test.js` (Vitest) | temp dirs; mock `gsettings` / `gdbus` via injected run() |
| Unmigrated Python | existing pytest | keep green |
| Ported command | **delete** the Python unit file in the same slice once Vitest covers it | leftover pytest that imports deleted modules is a bug |
| Layout plan (CN10) | **Golden fixtures**: `tests/unit/cli/fixtures/layout/*` → same plan JSON from JS as from a frozen Python dump | do not “improve” the planner |
| Live | only if the slice touches DBus apply / nest | host vs nest per `testing.md` |

`vitest.config.js` already includes `tests/**/*.test.js`. Put new tests
there. Do not add a second test runner.

Coverage include is `lib/**/*.js`. After `cli/` exists, **MAY** add
`cli/**/*.js` to coverage include in the slice that first lands
non-trivial cli code (CN2). Not required for CN0.

---

## Slices

Implement in this order. Each row is one task file after lock:
`agents/tasks/forge-cli-node_cnN-slug.md` (plan-linked).

### CN0 — Scaffold + purity inventory

**Agent:** `grok-4.5` as 4.5 **low** (mechanical).  
**Why first:** later slices need a legal import path and a written
inventory so agents stop re-scanning `lib/shared`.

**Do**

1. Create `cli/` with:
   - `cli/package.json` — `{ "name": "forge-cli", "private": true, "type": "module" }`
   - `cli/README.md` — short: Node 20+; import only pures; no `gi://`;
     add a command by adding `cli/<cmd>.mjs` + Python exec shim (until
     CN13).
   - `cli/smoke-import.mjs` — imports `listKits` from
     `../lib/shared/keybind-presets.js` and prints kit ids, one line.
     Used as a canary, not a user command.
2. Add `lib/shared/package.json` — `{ "type": "module" }` only (no
   other fields required). Silences typeless-package warning for
   shared pures.
3. Write the inventory table (copy from this plan’s table) into
   `cli/README.md` § “What Node may import”. Update it if you find
   another GJS import.
4. Add `tests/unit/cli/smoke-import.test.js` that spawns
   `node cli/smoke-import.mjs` and expects `safe` / `vim` / `i3` on
   stdout and exit 0.

**Do not**

- Move or rename `scripts/forge/*`.
- Change `~/.local/bin/forge`.
- Extract `forge-config-home` yet (that is CN3).
- Add dependencies.

**Accept**

- [ ] `node cli/smoke-import.mjs` exits 0
- [ ] `npm test -- tests/unit/cli/smoke-import.test.js` green
- [ ] `npm test` (full Vitest) still green
- [ ] `cli/README.md` lists node-safe vs gi-bound files

**Test**

```bash
node cli/smoke-import.mjs
npm test -- tests/unit/cli/smoke-import.test.js
npm test
```

---

### CN1 — Python exec helper + job-argv note

**Agent:** `grok-4.5` as 4.5 **medium**.  
**Why:** every migrated command uses one helper. Job runner must not
grow a second “always Python” assumption.

**Do**

1. Add `scripts/forge/node_exec.py` (name MAY be `cli_exec.py`):
   - `find_node() -> str | None`
   - `node_missing_message() -> str`
   - `cli_mjs(rel: str) -> Path` — `repo_root / "cli" / rel`
   - `exec_cli(rel: str, argv: list[str]) -> NoReturn` — `os.execv`
   - `run_cli(rel: str, argv: list[str]) -> int` — if a caller cannot
     exec (tests). Production commands use exec.
2. Unit: `tests/unit/cli/test_node_exec.py` — missing node; path
   resolve; `run_cli` with `cli/smoke-import.mjs`.
3. In `job_runner.forge_worker_argv` docstring: worker may be Node
   later; argv is opaque. Add a pytest that `spawn_worker` is called
   with a list starting with `"node"` (mock Popen) and does not
   prepend `sys.executable`.

**Do not**

- Exec any user command yet.
- Change production `worker_argv` in `forge`.

**Accept**

- [ ] Missing node path documented; helper returns 127 path
- [ ] Existing `test_job_runner.py` green
- [ ] New tests green

```bash
python3 -m pytest tests/unit/cli/test_node_exec.py tests/unit/cli/test_job_runner.py -q
```

---

### CN2 — `forge keybind` (first product slice)

**Agent:** `grok-4.5` as 4.5 **medium**. Review: `grok-4.6` if
save/load JSON drifts from prefs.  
**Why:** only command whose product truth is already JS; no DBus; not
a job mutator; install already invokes the module by path; prefs
already import the same presets.

**Do**

1. Implement `cli/keybind.mjs` (or `cli/keybind/index.mjs` if you
   split adapters). Subcommands: `save`, `load`, `status`, `list`,
   `dir`. Flags: `--dir`, `--dry-run`, `-v/--verbose`, `--json`.
2. Import from `lib/shared/keybind-presets.js` (and
   `keybind-conflicts.js` / `settings-keys.js` as needed):
   `getKit`, `listKits`, `buildProfileProps`, `matchKitId`,
   `sanitizeProfileName`, `isReservedKitName`, `KEYBINDING_PRESET_KEYS`.
3. **Do not** reimplement kit matching in the CLI.
4. I/O adapter (Node-only, in `cli/`):
   - profiles dir: `FORGE_KEYBIND_PROFILES_DIR` → else
     `FORGE_CONFIG_HOME/config/keybinding-profiles` → else
     `~/.config/forge/config/keybinding-profiles` (same as
     `keybind_kit.profiles_dir`).
   - live map: `gsettings` / `dconf` subprocess, same schema
     `org.gnome.shell.extensions.forge.keybindings` +
     `mod-mask-mouse-tile`. Reuse the Python approach (parse
     `gsettings list-recursively` / dconf dump). Inject
     `run(cmd) -> {stdout, stderr, code}` for tests.
5. Preserve output:
   - `save`: print the written path on stdout.
   - `load`: stderr `forge keybind: loaded kit:vim (N keys)` (and
     `dry-run ` prefix). Verbose lists keys on stdout.
   - `status`: human lines or `--json`; exit 2 if custom.
   - `list`: first line `# <dir>`, then names.
   - `dir`: print profiles dir.
6. Python: `cmd_keybind` / `build_keybind_subparser` stay so
   `forge keybind` still argparse-parses **or** argparse keeps the
   subparser and the handler is only `exec_cli("keybind.mjs",
   remaining)`. Simplest: keep argparse for help text; handler execs
   with `sys.argv` slice after `keybind`.
7. **Delete** kit-load-via-`node -e` in `keybind_kit.py`. Delete
   duplicated `sanitize_profile_name` / `match_kit_id` **once**
   Vitest covers them (they already exist in
   `tests/unit/shared/keybind-presets.test.js`).
8. `scripts/install.zsh` `_install_keybind_kit`: call
   `node "$repo/cli/keybind.mjs"` instead of
   `python3 keybind_kit.py`. Missing node → warn (same as missing
   python3 today), do not fail the whole install.
9. Standalone: `node cli/keybind.mjs load vim` must work (install).
10. Tests:
    - Vitest for profiles dir / sanitize / reserved / status JSON
      shape with injected `run`.
    - Keep a thin pytest **or** a Vitest spawn test that runs the
      real file `dir` / `list` against a temp `--dir`.
    - Delete `tests/unit/cli/test_keybind_kit.py` cases that only
      existed for Python helpers. If any test is the only coverage
      of a behavior, port it first.

**Do not**

- Change D031 (no `--reset` / `--profile`; `vim`/`safe`/`i3`
  reserved).
- Make prefs shell out to `forge`.
- Touch job runner production argv.

**Accept**

- [x] `forge keybind dir` / `list` / `status --json` / `save` /
      `load --dry-run vim` behave as today
- [x] `node cli/keybind.mjs status --json` works without PATH forge
- [x] `./install --kit=vim` still loads via the new file (dry-run the
      function if you cannot live-load; at least the path exists and
      `--dry-run` works)
- [x] No `node -e` kit loader left
- [x] Python body of kit apply/match/save **gone** (shim only)
- [x] `npm test -- tests/unit/shared/keybind-presets.test.js
      tests/unit/cli/keybind.test.js`
- [x] Remaining pytest green (`test_keybind_kit` removed or reduced
      to spawn)

**Refs:** `scripts/forge/keybind_kit.py`,
`lib/prefs/keyboard.js`, D031, `scripts/install.zsh`
`_install_keybind_kit`.

---

### CN3 — Extract GJS-free config-home (and only that)

**Agent:** `grok-4.5` as 4.5 **medium**.

**Why:** Node keybind currently must duplicate `FORGE_CONFIG_HOME`
rules. `forge-config-home.js` imports `gi://GLib`.

**Do**

1. Add pure `resolveForgeConfigHome({ env, userConfigDir })` in
   `lib/shared/` (either new `paths.js` or rewrite
   `forge-config-home.js` so the **default export functions** take
   injected env — **but** GJS callers today call
   `forgeConfigHome()` with no args).
2. Recommended shape (do not invent a third):

   ```js
   // lib/shared/paths.js  (pure)
   export const FORGE_CONFIG_HOME_ENV = "FORGE_CONFIG_HOME";
   export function resolveForgeConfigHome({ env = {}, userConfigDir }) { … }

   // lib/shared/forge-config-home.js  (GJS wrapper, keep name)
   import GLib from "gi://GLib";
   import { resolveForgeConfigHome, FORGE_CONFIG_HOME_ENV } from "./paths.js";
   export function forgeConfigHome() {
     return resolveForgeConfigHome({
       env: { [FORGE_CONFIG_HOME_ENV]: GLib.getenv(FORGE_CONFIG_HOME_ENV) },
       userConfigDir: GLib.get_user_config_dir(),
     });
   }
   ```

3. Point `cli/keybind.mjs` at `resolveForgeConfigHome` +
   `os.homedir()` / `path.join(..., ".config")`.
4. Port/adjust `tests/unit/shared/forge-config-home.test.js` so the
   **pure** function is tested without GLib mocks. Keep a thin GJS-
   wrapper test if cheap.

**Do not** extract `settings.js` / `config-sync.js` in this slice.

**Accept**

- [x] Node can resolve nest `FORGE_CONFIG_HOME` without `gi://`
- [x] Existing nest rule: env is the root (do **not** append `/forge`)
- [x] `npm test -- tests/unit/shared/forge-config-home.test.js`

---

### CN4 — DBus adapter + `ping` + `tree`

**Agent:** `grok-4.5` as 4.5 **medium**.

**Why:** proves Node session-bus I/O without touching layout.

**Do**

1. `cli/dbus.mjs` — `gdbus call --session --dest
   org.gnome.Shell.Extensions.Forge --object-path
   /org/gnome/Shell/Extensions/Forge --method
   org.gnome.Shell.Extensions.Forge.<Method> …`
   Mirror `_METHOD_IN_ARGS` in `scripts/forge/forge`.
2. Parse gdbus’s GVariant-ish stdout the same way Python’s gdbus
   backend does (read that function; do not invent a new JSON
   envelope). Methods already return a **single string** (JSON).
3. `cli/ping.mjs`, `cli/tree.mjs` (or `cli/cmd/ping.mjs`). Preserve
   flags: `tree --monitor= --compact` / JSON pretty-print behavior.
4. Python `cmd_ping` / `cmd_tree` become exec shims.
5. Vitest: mock `run()` with fixture stdout. Optional live:
   `forge ping` if the extension is enabled — not required for
   slice accept.

**Do not** add `dbus-next`. Do not drop the Python `gi` backend until
**all** DBus commands have moved (or CN13). Until then Python gi
still serves unmigrated commands.

**Accept**

- [x] `forge ping` / `forge tree` help + dry mocked tests green
- [x] Python functions for ping/tree are shims only

---

### CN5 — Thin DBus verbs

**Agent:** `grok-4.5` as 4.5 **medium**.

`focus`, `swap`, `move`, `get`, `set`, `settings save|load`.

Use CN4 adapter. Import `resolvePortableKey` /
`coerceForGSettingsType` from `lib/shared/settings-control.js` if the
CLI currently reimplements allowlists — delete the Python twin.

Selectors stay **strings** passed to DBus (`tile-select.js` lives in
the extension). Do not port selector matching into Node.

**Accept:** argv/exit/JSON match; Python bodies deleted; Vitest on
flag parsing; `python3 -m pytest tests/unit/cli/test_forge_class_eq.py`
still green if it tests Python helpers — **move or delete** that file
if the helper moved.

---

### CN6 — `launch` + `run` / `run-steps`

**Agent:** `grok-4.5` as 4.5 **medium**.

**Do**

1. Node launch: desktop resolve (`gio launch` / `gtk-launch`) + wait
   for wm_class (same timeouts). Ghostty multi-instance flag stays
   (`--gtk-single-instance=false`).
2. Import `partitionMixedSteps` from
   `lib/extension/run-steps.js`. **Delete**
   `layout_lib.partition_mixed_steps`.
3. These commands **are** job mutators (`run` / `run-steps`).
   **Keep Python as the PATH entry** so `maybe_run_as_job` still
   wraps `python forge run-steps …`, and the **worker** Python then
   execs Node for the body. That way job logs/HUP stay unchanged.

   Flow:

   ```text
   TTY: python forge run-steps …     # job parent
     worker: python forge run-steps …  # FORGE_JOB_WORKER=1
       exec node cli/run-steps.mjs …
   ```

**Do not** port `job_runner.py` here.

**Accept:** partition tests move to the existing
`tests/unit/extension/run-steps.test.js` (already has
`partitionMixedSteps`); Python twin + its pytest cases gone;
`test_layout_lib.py` partition cases deleted.

---

### CN7 — Job-runner readiness (no full port)

**Agent:** `grok-4.5` as 4.5 **low**. Skip if CN6 already recorded the flow.

Only if CN6’s “Python parent execs Node in the worker” is ugly or
broken.

**Do:** `forge_worker_argv` stays Python. Document the CN6 flow in
`cli/README.md`. Add one job-runner unit: worker env still has
`FORGE_JOB_WORKER=1` after exec (it must — exec inherits env).

Skip this slice if CN6 already recorded the flow.

---

### CN8–CN12 — CANCELLED (do not assign)

These were a Python→`cli/` port of layout list/plan/apply. That would
be thrown away when ApplyLayout lands.

| Old id | Replacement |
| --- | --- |
| CN8 list/show/save | Stays Python until in-process apply; then a thin Node facade |
| CN9 settle store JS | Part of in-process apply (shared math already in `settle-math.js`) |
| CN10 planner port | In-process apply — expected-fixture parity **into** `lib/shared` / extension, not `cli/` |
| CN11 apply helpers | Extension signal waits, not Node poll twins |
| CN12 cmd_layout spine | `cli/layout.mjs` calls DBus ApplyLayout only |

**Agent:** none. If an orchestrator is tempted to start these, spawn
`grok-4.6` against [forge-layout-in-process](./forge-layout-in-process.md)
for design, not a 4.5 implementer.

---

### CN13 — Node router is PATH `forge`

**Agent:** `grok-4.6` (PATH + job runner). After CN2–CN6 and preferably
after the ApplyLayout thin client exists.

**Do**

1. `cli/forge.mjs` — parse global `--color`, `--first`, `--version`,
   dispatch to `cli/<cmd>.mjs` or leftover Python.
2. Leftover Python: `nested`, `test`, maybe `install`/`update` if
   not yet moved — `child_process.spawnSync(python, [legacy, …])`.
3. `_lib.zsh`:
   - `forge_cli_repo_path` → `$repo/cli/forge.mjs` (or a tiny
     `cli/forge` shebang wrapper).
   - `forge_cli_bin_is_ours` also matches `*/cli/forge` and
     `*/cli/forge.mjs`.
   - `install-origin.json` `"cli"` field updates.
4. Port or wrap `job_runner` so the Node router can start jobs
   (setsid, HUP ignore, logs). Prefer a faithful port to
   `cli/job-runner.mjs` with Vitest translated from
   `test_job_runner.py`.
5. Shebang: `#!/usr/bin/env node`
6. `chmod +x`.

**Do not** leave two PATH entries.

**Accept:** `./install` retargets the symlink; `forge ping` and
`forge layout list` work; `forge_cli_bin_is_ours` true; foreign
`~/.local/bin/forge` still refused.

---

### CN14 — `nested` + `test live` + jobs CLI if still Python

**Agent:** `grok-4.6` if ported (harness is sharp); else leave Python.

Dev harness. Same contracts (`D022`, live matrix tags). Lowest
user-facing value. Can stay Python for a long time **if** CN13’s
legacy spawn is solid.

---

### CN15 — Delete Python control CLI

**Agent:** `grok-4.5` as 4.5 **low** (grep + delete) after CN13.

Remove `scripts/forge/forge` and leftover `.py` when no spawn
remains. Keep zsh. Grep `scripts/forge/forge` and update DESIGN /
project.md / HANDOFF paths. `agents.py` stays Python.

---

## Separate later plan (not CN)

**In-process apply** — [forge-layout-in-process](./forge-layout-in-process.md).
4.6 xhigh designs; do not sneak a planner port into CN0–CN6.

---

## Docs after lock

| When | What |
| --- | --- |
| Lock | D036 in `docs/DECISIONS.md`; short DESIGN § CLI language; this plan status → active |
| CN2 | user `keybindings.md` install snippet if the `python3 keybind_kit.py` path is documented |
| CN13 | `scripts/forge/README.md`, DESIGN CLI path, `project.md` CLI jobs code path |
| Each slice | overwrite the task session note; do not pile HANDOFF unless PATH changes |

Proposed D036 (edit on lock, do not invent a different ID if D036 is
taken — next free D0xx):

> Control CLI language is Node. Product policy lives in pure ESM.
> Prefs/extension/CLI are facades. Migrate by subcommand. Layout
> apply stays Python until CN12. Zsh install plane stays. In-process
> ApplyLayout is a separate decision.

---

## Open questions (user lock)

**Locked 2026-08-14 (operator):**

1. Non-layout CLI (CN0–CN6) + `lib/shared` gi-free rule — **yes** (D036).
2. Python router until CN13 — **yes**.
3. First CLI code **after TD1** (or parallel only if TD1 files are
   idle): CN0+CN1 then CN2.
4. ApplyLayout design **after TD1** — **yes** (D037). Not now.

---

## Risk register

| Risk | Mitigation |
| --- | --- |
| Half-migrated two languages | Allowed; contracts above; delete Python bodies per slice |
| Job runner assumes Python | CN1 docstring + CN12 changes worker argv |
| Drift if both bodies live | FIRM #6 |
| layout_plan “cleanup” rewrite | Gold files; forbid algorithm changes |
| `gi://` accidentally imported | CN0 inventory; CN3 extract |
| Install breaks on PATH retarget | CN13 updates `_lib.zsh` in the same slice |
| Agents start with layout | This plan + PRIORITY later; FIRM #2 |

---

## Session note

**2026-08-18:** CN13 done — PATH `cli/forge.mjs`; job runner port
`cli/job-runner.mjs`; `_lib.zsh` retarget. Worker argv
`[node, cli/forge.mjs, …]`. Leftover Python spawn (`layout`/install/
`jobs`). Vitest cli **169**; live ping + layout list. Next CN14/CN15.

**2026-08-15:** CN6 done — `cli/launch-lib.mjs` + `launch`/`run`/
`run-steps` `.mjs`; Python shims; job parent→worker→Node exec documented
in `cli/README.md` (**CN7 skip**). `layout_lib.partition_mixed_steps`
deleted; layout keeps Python `do_launch` + private chunker. Vitest
cli+run-steps **145 PASS**; pytest cn6/cn5/layout_lib/job_runner **110**.
Next residual R027/Wave Z or AL0.

**2026-08-14:** CN5 done — thin DBus verbs via CN4 `callMethod`:
`cli/cmd-result.mjs` (`withFirst`/`cmdResult`) + `focus`/`swap`/`move`/
`get`/`set`/`settings` `.mjs`; Python `cmd_*` → `exec_cli` shims;
those names in `_NO_DBUS_COMMANDS`. Python `_with_first`/`_cmd_result`
kept for run-steps. Vitest cli **94 PASS**; pytest cn5/shim/node_exec/
class_eq **38 PASS**. Live `forge get tiling-mode-enabled` ok.

**2026-08-14 (earlier):** CN4 done — `cli/dbus.mjs` (gdbus + GVariant-ish
parse mirroring Python `_call_gdbus`; `_METHOD_IN_ARGS`); `cli/ping.mjs`
/ `cli/tree.mjs`; Python `cmd_ping`/`cmd_tree` → `exec_cli` shims;
ping/tree in `_NO_DBUS_COMMANDS` (Node owns gdbus). Vitest 35 +
pytest shim 5 green; live `forge ping` ok + `tree --compact`. Python
`gi` backend **kept** for unmigrated cmds.

**2026-08-14 (earlier):** CN3 done — pure `lib/shared/paths.js`
(`resolveForgeConfigHome` + `FORGE_CONFIG_HOME_ENV`); GJS
`forge-config-home.js` wrapper only; `cli/keybind.mjs`
`resolveProfilesDir` uses pure + `os.homedir()`/`.config`. Vitest
28 PASS (pure + thin wrapper + keybind). Live dir + status matched
vim.

**2026-08-14 (earlier):** CN2 done — `cli/keybind.mjs` (shared presets +
gsettings/dconf), Python `keybind_kit.py` shim → `exec_cli`, install
`--kit=` via Node, Vitest + thin pytest. Live smoke: status matched
vim, load dry-run 63 keys. Prefs Gio path unchanged.

**2026-08-14 (earlier):** CN1 done — `scripts/forge/node_exec.py`
(`find_node`, `cli_mjs`, `exec_cli`/`run_cli`, missing-node **127**),
unit tests, `forge_worker_argv` opaque-argv docstring + `spawn_worker`
node mock. Production worker argv unchanged.
