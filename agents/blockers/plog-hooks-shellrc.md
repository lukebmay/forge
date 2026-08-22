# B-plog-hooks-shellrc — Wait on shellrc plog sink-hooks design

**Status:** open
**Severity:** soft (does **not** stop preflight / slot-id / min-learn / DnD work)
**Owner:** human (shellrc design) + forge (wire after vendor)
**Kind:** design
**Plan:** [forge-observability-hardening](../plans/forge-observability-hardening.md)
**Unblocks:** [forge-log-level-retarget](../tasks/forge-log-level-retarget.md) only
**Priority:** P0 (logging) — other PRIORITY rows stay runnable
**Created:** 2026-08-22
**Updated:** 2026-08-22

## Why this is human-only (shellrc)

plog v1 lives in shellrc. Dual-sink (quiet journal + full file) needs
**hooks** designed there:
`~/dev/me/shellrc/agents/blockers/B-plog-hooks-design.md`.

## Agent prep / locked prefs (do not re-ask)

- Journal: INFO / WARN / ERROR only
- Independent log: TRACE…ERROR (+ same INFO+)
- `plog.*` fan-out via hooks after shellrc ships + forge vendors
- Default file path proposal: `~/.local/state/forge/forge.log`
- While blocked: implement other PRIORITY P0s; ask only on **critical new findings**

## Done when

shellrc hooks designed + implemented; forge vendors pin; log-level-retarget
unblocked and completed.
