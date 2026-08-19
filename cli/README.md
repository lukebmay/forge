# forge CLI (Node)

Node 20+ bodies for `forge` commands. Product logic that prefs /
extension / CLI all need lives once under `lib/shared/` (pure ESM).
This tree grows command facades (`fs`, `gsettings`, `gdbus`); it does
**not** replace `scripts/forge/*.zsh` install helpers.

## How to add a command

1. Add `cli/<cmd>.mjs` (or a small module it imports).
1. Wire it in `cli/forge.mjs` `NODE_COMMANDS` (PATH entry). Leftover
   Python verbs stay on `spawnSync(python3, [scripts/forge/forge, …])`.
1. Import **only** node-safe pures from `lib/shared/` (and a few pure
   helpers under `lib/extension/`). Never import `gi://` modules.

## PATH entry

`./install` symlinks `~/.local/bin/forge` → `cli/forge.mjs`. That
router parses global `--color` / `--first` / `--version`, dispatches
Node bodies, and spawns leftover Python (`layout`, install family,
`jobs`, `thrash`, `save-session-layout`). Nest/live stay on
`forge-test` (D045) — `forge test` / `forge nested` hard-break.

## Job mutators (`run` / `run-steps` / layout apply / install)

Node router owns durable jobs (`cli/job-runner.mjs`). Worker argv:

```text
[node, $repo/cli/forge.mjs, …cleaned]
```

```text
TTY: node cli/forge.mjs run-steps …   # job parent (maybeRunAsJob)
  worker: node cli/forge.mjs run-steps …  # FORGE_JOB_WORKER=1
    Node body in-process (or leftover Python with FORGE_JOB=0)
```

`forge launch` is not a job mutator. Layout planner/apply stay Python
(not a `cli/` port). Python `scripts/forge/forge` remains for spawn
until CN15.

## FIRM: `lib/shared/` purity

**No `gi://`, no `node:`, no `process`, no `fs`** in new
`lib/shared/` files. Host I/O belongs in `cli/` (Node) or
`lib/prefs/` / `lib/extension/` (GJS). Extract a pure beside a GJS
wrapper when Node needs the rule (see CN3 / D036).

Do **not** flip root `package.json` `"type": "module"`. Only `cli/`
and `lib/shared/` declare `"type": "module"`.

## What Node may import

Inventory proven 2026-08-14 (Node 24.3). Vitest can import GJS files
because `tests/setup.js` mocks `gi://`; real Node cannot.

| File | Node import? |
| --- | --- |
| `lib/shared/keybind-presets.js` | **Yes** (pure) |
| `lib/shared/settings-keys.js` | **Yes** (pure) |
| `lib/shared/settings-control.js` | **Yes** (pure) |
| `lib/shared/keybind-conflicts.js` | **Yes** (pure) |
| `lib/shared/gnome-overrides.js` | **Yes** (pure) |
| `lib/shared/rival-tilers.js` | **Yes** (pure) |
| `lib/extension/settle-math.js` | **Yes** (pure) |
| `lib/extension/run-steps.js` (`partitionMixedSteps`) | **Yes** (pure; no Gio/Meta) |
| `lib/shared/forge-config-home.js` | **No** (`gi://GLib`) |
| `lib/shared/settings.js` | **No** (`gi://`) |
| `lib/shared/config-sync.js` | **No** (`gi://`) |
| `lib/shared/theme.js` | **No** (`gi://`) |
| `lib/shared/logger.js` | **No** (pulls `settings.js` / GJS) |

Canary (not a user command):

```bash
node cli/smoke-import.mjs
```

Imports `listKits` from `keybind-presets.js` and prints kit ids.
