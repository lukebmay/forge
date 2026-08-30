---
title: plog (forge extension)
read_when: Adding logging, choosing a logger, reading or hunting logs, or working in a repo that uses plog / forge log / plog-query
order: 82
---

# plog (forge extension)

**Base:** follow [`agents/installed/plog.md`](./installed/plog.md). On
conflict, **this extension wins**.

## Hunt surface (FIRM)

Hunt Shell / extension tapes **only** with **`forge log`** (forwards to
vendored `plog-query`). Status (`forge log` with no subcommand) prints
tape paths for humans and for the query CLI — they are **not** files for
agents to open, `cat`, `tail`, `rg`, or parse with Python/`read_file`.

| Do | Do not |
| --- | --- |
| `forge log --session S --grep PAT --level info+ --last N` | `read_file` / `cat` / `tail` / `rg` / `open()` on `forge.log` or `forge.jsonl` |
| `forge log --json --grep PAT --session S` for fields | Mix sessions; unfiltered `--last` at TRACE |
| `forge log query …` when the wrapper needs extra plog-query flags | Journal `INFO` hunts (journal is WARN+ only) |

If `forge log` cannot answer “what happened?”, that is an **observability
gap**: add a greppable token (see catalog § Hunt / instrumentation). Do
not bypass the query tool to scrape the tape.

Product hunts: [`project.md`](./project.md) § Logging.
