# forge-log-query-pretty-wire — TTY inherit + re-vendor + hunt fields (D067)

**Status:** done
**Plan:** shellrc [plog-query-pretty](../../../shellrc/agents/plans/pansi/plog-query-pretty.md)
  (cross-repo; locks live in shellrc) · parent forge observability / D054
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-23

## Goal

Make `forge log` query color work on a real TTY, then after shellrc ships
plog-query 1.1.0: re-vendor and migrate hunt/debug emits to `{ fields }` so
pretty payload is real structured data.

## Acceptance

- [x] **Q0:** `cli/log.mjs` `runPlogQuery` inherits stdout/stderr when parent
      streams are TTYs (or equivalent) so `--color=auto` sees a TTY; tests
      updated; `forge log --last 1 --grep slot` shows ESC on interactive TTY
- [x] **Q5:** Re-snap `third_party/plog-query` (and pansi if needed) from
      shellrc after Q1–Q4 green; VERSION note
- [x] **Q6:** `hunt-logs.js` (+ primary callers) emit `{ fields }` for structured
      hunts; JSONL `payload` non-empty on those lines; flat string bridge no
      longer required for tile-slot-float
- [x] Move to `tasks/completed/` when done

## Context for the next agent (complete + succinct)

- **Shipped:** Q0 TTY inherit · Q5 plog-query **1.1.0** (`shellrc_rev` in
  `third_party/plog-query/VERSION`) · Q6 `huntTileSlotFloat(event, fields)`
- **Paths:** `cli/log.mjs` (forwards `--pretty`/`--hilight`/`--compact`/
  `--bat-theme`) · `third_party/plog-query/` · `lib/extension/hunt-logs.js` ·
  callers in `window.js` / `layout-apply-run.js`
- **Policy D054 unchanged:** warn+ flatten fields into message; info/debug/trace
  keep structured payload
- **pansi JS:** not re-snapped (unchanged since prior vendor; only Python query)
- Tip/nest reload needed before new hunt emits hit live JSONL

## Session note

**2026-08-23 — Q5+Q6 shipped:** re-vendor 1.1.0; hunt `{ fields }`;
`forge log query --version` → `plog-query 1.1.0`. Shellrc HANDOFF may still
say “forge Q5/Q6 pending” until that repo notes otherwise.
