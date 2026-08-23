# forge-log-dual-tape-query — PLOG 1.3.0 dual-tape + `forge log` query (D054)

**Status:** done
**Plan:** forge-observability-hardening (logging follow-on)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-23

## Goal

Vendor shellrc plog **1.3.0** (D066 dual-tape) + `plog-query`, enable forge
JSONL beside the hunt file, decide journal/fields policy, and forward
`forge log …` query args to the shell query CLI.

## Acceptance

- [x] Re-snap `third_party/pansi` to shellrc PLOG 1.3.0
- [x] Vendor `third_party/plog-query` (Python plog_query + p/ansi_color)
- [x] Adapter: jsonl default ON; truncate both; fields peel on warn+
- [x] `forge log query|show|…` / query flags → plog-query (forge tape defaults)
- [x] D054 + DESIGN/contracts/troubleshooting
- [x] Unit tests green; live `forge log` query smoke

## Context for the next agent (complete + succinct)

- **Paths:** `third_party/pansi/` · `third_party/plog-query/` ·
  `lib/shared/plog-adapter.js` · `cli/log.mjs` · `cli/plog.mjs`
- **Policy (D054):** warn/error/fatal flatten `{ fields }` into message
  (journal = `.log`); info/debug/trace may keep structured fields for JSONL
- **Query:** `forge log --last 50 --grep slot` · `forge log query --level warn+`
- **Disable JSONL:** `FORGE_LOG_JSONL=0`
- **Enable after tip/nest reload** so extension writes jsonl; CLI query works
  against existing tapes immediately once jsonl exists
- **Re-snap:** copy from `~/dev/me/shellrc` util/js + util/python; update VERSION

## Session note

Shipped D054 on master (uncommitted until operator asks). Sampled layout-apply
call sites with `{ fields }` for searchable hunts.
