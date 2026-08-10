# forge-nested-isolation_n1-data-root — Nest FORGE_HOST + CLI data roots

**Status:** ready  
**Plan:** [forge-nested-isolation](../plans/forge-nested-isolation.md)  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-10  
**Depends on:** N3 preferred first (cleanup); can parallelize carefully

## Goal

Treat nest as a **separate logical host** for CLI forge mutators:

- `FORGE_HOST=<hostname>-sub-<nestname>` (e.g. `black-sub-forge`)
- Nest-scoped config/state dirs so settle-heuristics / windows paths used by
  **CLI** do not rewrite parent `~/.config/forge`

## Acceptance

- [ ] Nest client env (env/export/exec/run) sets `FORGE_HOST` and forge config
      root env vars (define one clear contract, e.g. `FORGE_CONFIG_HOME` or
      documented `XDG_CONFIG_HOME` under nest state)
- [ ] CLI settle + layout host resolution uses nest host id when set
- [ ] Unit: path helpers + env merge; parent heuristics path ≠ nest path
- [ ] Live (optional): nest layout smoke does not change parent
      `settle-heuristics.json` mtime/content for parent host key
- [ ] Layout **profiles** still resolve from shared `layout/` / `FORGE_LAYOUT_DIR`
      (fixtures shared; timings not)

## Context for the next agent

- `settle_heuristics.py` / `layout_lib.py` already honor `FORGE_HOST`
- Nest state: `~/.local/state/forge/nested/<name>/`
- Extension still may write parent until **N2** — document that gap
- Default mon=1 for smokes

## Session note

Created 2026-08-10 after D022.
