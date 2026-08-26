# forge-layout-settle-contract_se9-reset-heuristics — SE9 invalidate + reset CLI

**Status:** done  
**Plan:** [forge-layout-settle-contract](../../forge-layout-settle-contract.md) (task **SE9**)  
**Branch:** master  
**Updated:** 2026-08-09

## Goal

Operator wipe for settle heuristics + clear contract when schema/engine version
bumps so stale samples cannot poison soft timeouts.

## Acceptance

- [x] `load_store` empty on schema mismatch (already); documented + `schema_version_ok`
- [x] `store_file_status` reports path/valid/version/entryCount/reason
- [x] `reset_heuristics_file` writes empty schema (default) or `--unlink`
- [x] Clears process `HeuristicsSession` on reset
- [x] CLI: `forge thrash heuristics`, `forge thrash reset-heuristics` [--unlink]
- [x] DBus not required for heuristics/reset actions
- [x] Units for status/reset/unlink/mismatch
- [x] User layout.md + DESIGN note

## Context for the next agent

| Piece | Path |
| --- | --- |
| Store | `scripts/forge/settle_heuristics.py` — `SCHEMA_VERSION`, `store_file_status`, `reset_heuristics_file` |
| CLI | `scripts/forge/forge` `cmd_thrash` + dispatch skip-DBus |
| Help | `scripts/forge/cli_help.py` thrash one-liner |
| Tests | `tests/unit/cli/test_settle_heuristics.py` |

**Bump contract:** raise `SCHEMA_VERSION` when entry shape or soft/hard timeout
*semantics* change. Mismatched files stay on disk until reset or next successful
write; product always loads empty for bad version.

```bash
python3 -m pytest tests/unit/cli/test_settle_heuristics.py -q
forge thrash heuristics
# forge thrash reset-heuristics          # write empty v schema
# forge thrash reset-heuristics --unlink # delete file
```

## Session note

**2026-08-09:** SE9 done. No live layout matrix required (file/CLI only).
