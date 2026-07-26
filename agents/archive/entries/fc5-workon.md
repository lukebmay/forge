# FC5 — forge workon composition

**Date:** 2026-07-26  
**Tags:** cli, scripting, workon, gdisplays  
**Task:** [forge-command_fc5-workon.md](../../plans/forge-command/completed/forge-command_fc5-workon.md)

## What

Named morning profiles: `forge workon <name>` loads
`~/.config/forge/workon/<name>.json`, optionally runs `gdisplays load` +
settings profile, then mixed steps (launch/wait CLI-side, tree ops via
RunSteps). `forge run` shares the mixed orchestrator; `run-steps` stays
extension-only.

## Why

FC0–FC4 primitives still needed multi-command glue for a dual-head morning.
Profiles compose without a new DBus method or shadowing shellrc `workon`.

## Design choices

- CLI-only composition (partition chunks → RunSteps per extension batch)
- Hard-fail if `displays` set but `gdisplays` missing
- Pure helpers in `workon_lib.py` (no Shell required for unit tests)

## Not done

- Live dual-head morning smoke on `black`
- GUI recorder / declarative full-tree restore
