# Vendored plog-query (from shellrc)

Pinned snapshot of shellrc Python `plog-query` plus its `p` / `ansi_color`
deps for forge's `forge log` query surface (D066 dual-tape).

See `VERSION` for exact revisions. **Do not edit these files in forge** —
re-snap from shellrc after bumping there.

| File | Role |
| --- | --- |
| `plog-query` | CLI entry (PATH-relative launcher) |
| `plog_query.py` | Filter / reprint JSONL |
| `p.py` / `ansi_color.py` | Color reprint deps |

Default file resolution uses `P_LOG_JSONL` or sibling of `P_LOG_FILE`.
Forge sets both when forwarding `forge log …` query args.

`plog_query.test.functional.py` is an upstream reference; case Q-14 expects
shellrc `bin/plog-query`. Prefer forge unit tests + `./plog-query --help`.
