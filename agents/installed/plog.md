---
title: plog (logger + dual-tape query)
read_when: Adding logging, choosing a logger, reading or hunting logs, or working in a repo that uses plog / forge log / plog-query
order: 82
---

# plog — levels, dual tape, query

**plog** is the portable logger in the **pansi** family. Human-readable ANSI
`.log` tape + optional JSONL twin + shell **`plog-query`**. Apps often wrap
query as `appname log …` (e.g. **`forge log`**).

Install this catalog item into repos that **use** plog (or vendor it). Pair with
**`pansi`** + **`ansi-colors`**.

## When to use (GUIDELINE)

| Situation | Do |
| --- | --- |
| Project already on plog / `forge log` / vendored pansi plog | **Use it** — extend sinks/levels; do not add a second logger |
| Need real logging (levels, files, sessions, searchable history) and **no** logger (or `console.log` / `print` soup) | **Prefer plog** |
| One-shot script, no ops need | stderr + exit codes may suffice |
| Colors only, no levels/files | **pansi** alone |

## Architecture (FIRM mental model)

```text
emit → render once via p/pstr → action pipeline (D064)
         ├─ human tape  .log     (always ANSI on file; D062 line grammar)
         └─ machine tape .jsonl  (opt-in / app policy; D066)
query ← plog-query (shell-first) ← apps forward flags
```

| Tape | Role | Default |
| --- | --- | --- |
| **`.log`** | Scannable colorized human tape | Primary durable surface |
| **`.jsonl`** | Typed search (`fields`, `levelN`, `id`, time) | **Opt-in** in library (`jsonl:` / `P_LOG_JSONL`); apps **may** default it on (forge does) |

**Do not** treat journald / `tail` as the hunt UI when dual-tape exists.

## Levels

Five product levels (plus app-specific mirrors like forge FATAL/ALL):

`trace` < `debug` < `info` < `warn` < `error`

Default min is typically **`info`** unless the app sets otherwise (forge:
regular install → INFO; `--dev` → TRACE; `--prod` → WARN — see that project’s
`project.md`).

Below the effective min, lines are **not emitted** to any sink.

## Line grammar (human tape)

```text
YYYY-MM-DD_HH:MM:SS LEVEL [SESSION] | message
```

JSONL twin carries stable **`id`** = `{session}:{pid}:{seq}` (no `#id` in the
durable `.log` line). Query reprint may show `#session:pid:seq` at **view
time** only (D067).

## Env (library)

| Var | Role |
| --- | --- |
| `P_LOG_*` | Library config family |
| `P_LOG_FILE` | Human tape path |
| `P_LOG_JSONL` | JSONL twin path (opt-in sugar) |
| `P_LOG_TEE` | Tee (not stderr overload) |
| `P_LOG_FILE_STDERR` | Error-file path (distinct from tee) |

Apps may bridge (`SHELLRC_LOG_FILE` → `P_LOG_FILE`, `FORGE_LOG_FILE`, …).

## Query discipline (FIRM)

**TRACE (and busy DEBUG) is for queries — never for `tail`.**

| Do | Do not |
| --- | --- |
| `plog-query --session S --level warn+ --last 50` | `tail -f ~/.….log` as a hunt |
| `plog-query --grep place-hint --since 10m` | Expect `plog-query --last 80` alone to be readable at TRACE |
| App wrapper: `forge log --grep slot --level info+` | `rg` alone for time/level ranges when JSONL exists |
| Filter **session** after reload / new Shell | Mix old and new sessions without noticing |

At TRACE, volume is often **tens of lines/sec** (render fanout, float reasons,
title churn). Raw tail is noise; **filtered query is the product**.

Useful flag patterns (plog-query / forge log forward):

```text
--session ID
--level info+|warn+|debug|trace
--since 2h | --until …
--last N
--grep PAT
--json          # machine; plain
--pretty / --compact / --hilight / --bat-theme …
```

Pretty is **view-time only** — durable `.log` / JSONL unchanged (D067).

## Agent rules (FIRM)

1. **Hunt with query**, not `tail` / unfiltered `--last` at TRACE.
2. Prefer **JSONL** for fielded hunts when the app opts in; use `.log` for
   human eyes-on after a tight filter.
3. Call sites: short title + optional **`fields`** at INFO+ when JSONL matters;
   **WARN/ERROR**: put values in the message if the app flattens fields for
   journal (forge D054).
4. Do not invent a second log path beside an existing plog init.
5. Vendored apps: pin plog + plog-query; bump with shellrc deliberately.
6. **Newest design meeting / DECISIONS row wins** (D064 superseded D060; D066
   amended optional JSONL vs older “no JSON” notes). See `general.md`.

## Where the code lives

| Piece | shellrc | Typical product vendor |
| --- | --- | --- |
| Logger | `util/<lang>/plog.*` | `third_party/pansi/plog*.js` (etc.) |
| Query CLI | `bin/plog-query` · `util/python/plog_query.py` | `third_party/plog-query/` |
| Design | `agents/plans/pansi/plog-*.md` | Project DECISIONS (e.g. forge D050+) |

## Decisions (shellrc)

| ID | Note |
| --- | --- |
| D060 | **superseded** (file-only default) |
| D061 | `P_LOG_*` env |
| D062 | Line grammar; `p`/`pstr` only for message render |
| D064 | Action pipelines; multi-sink; **supersedes D060** |
| D066 | Optional JSONL + `plog-query` |
| D067 | Query pretty / bat / match hilight |

Plans: `plog-design.md`, `plog-hooks-design.md`, `plog-dual-tape-query.md`,
`plog-query-pretty.md` under `agents/plans/pansi/`.
