# forge CLI (Node)

Node 20+ bodies for `forge` commands. Product logic that prefs /
extension / CLI all need lives once under `lib/shared/` (pure ESM).
This tree grows command facades (`fs`, `gsettings`, `gdbus`); it does
**not** replace `scripts/forge/*.zsh` install helpers.

## How to add a command

1. Add `cli/<cmd>.mjs` (or a small module it imports).
1. Until CN13, keep a thin Python exec shim under `scripts/forge/` so
   `~/.local/bin/forge` still routes the same argv.
1. Import **only** node-safe pures from `lib/shared/` (and a few pure
   helpers under `lib/extension/`). Never import `gi://` modules.

## Job mutators (`run` / `run-steps`)

Python stays on PATH so durable jobs wrap unchanged. Flow (CN6):

```text
TTY: python forge run-steps …     # job parent (maybe_run_as_job)
  worker: python forge run-steps …  # FORGE_JOB_WORKER=1
    exec node cli/run-steps.mjs …   # body; inherits job env/logs
```

Same pattern for `forge run`. `forge launch` is not a job mutator; it
execs Node directly from the Python shim. Layout still uses Python
`do_launch` / `run_mixed_steps` in-process (not a `cli/` port).

CN7 can skip if this flow stays clean (worker argv remains Python;
Node only replaces the body after the job gate).

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
