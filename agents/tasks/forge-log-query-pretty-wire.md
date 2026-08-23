# forge-log-query-pretty-wire — TTY inherit + re-vendor + hunt fields (D067)

**Status:** next
**Plan:** shellrc [plog-query-pretty](../../../shellrc/agents/plans/pansi/plog-query-pretty.md)
  (cross-repo; locks live in shellrc) · parent forge observability / D054
**Branch:** master
**Blocker:** (none) — Q5/Q6 wait on shellrc Q1–Q4; **Q0 can start immediately**
**Updated:** 2026-08-23

## Goal

Make `forge log` query color work on a real TTY, then after shellrc ships
plog-query 1.1.0: re-vendor and migrate hunt/debug emits to `{ fields }` so
pretty payload is real structured data.

## Acceptance

- [ ] **Q0:** `cli/log.mjs` `runPlogQuery` inherits stdout/stderr when parent
      streams are TTYs (or equivalent) so `--color=auto` sees a TTY; tests
      updated; `forge log --last 1 --grep slot` shows ESC on interactive TTY
- [ ] **Q5:** Re-snap `third_party/plog-query` (and pansi if needed) from
      shellrc after Q1–Q4 green; VERSION note
- [ ] **Q6:** `hunt-logs.js` (+ primary callers) emit `{ fields }` for structured
      hunts; JSONL `payload` non-empty on those lines; flat string bridge no
      longer required for tile-slot-float
- [ ] Move to `tasks/completed/` when done

## Context for the next agent (complete + succinct)

- **Bug:** `runPlogQuery` uses `stdio: ["inherit","pipe","pipe"]` → child
  `isatty` false → auto color off. Direct `plog-query --color=always` works.
- **Paths:** `cli/log.mjs` · `third_party/plog-query/` ·
  `lib/extension/hunt-logs.js` · callers in `window.js` /
  `layout-apply-run.js`
- **Policy D054 unchanged:** warn+ flatten fields into message; info/debug/trace
  keep structured payload
- **Do not** block OH downstream forever — Q0 is small; Q5/Q6 after shellrc
- Shellrc task: `~/dev/me/shellrc/agents/tasks/pansi_plog-query-pretty.md`

## Session note

**2026-08-23 — design locked with shellrc D067; Q0 unblocked now.**
