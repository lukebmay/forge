# SQLite

**Precedence:** project pragmas, migration tooling, and embedder (app) conventions override this file.

## When

Excellent for local apps, tests, single-node tools, edge/embedded. Not a drop-in multi-writer network DB.

## Style & SQL

- Parameterized queries only
- Explicit schemas; migrate with versioned SQL or the project’s tool
- Prefer `WAL` mode for concurrent readers + one writer (when appropriate)
- Types are affinity-based — still document intended types; validate in app
- Foreign keys: `PRAGMA foreign_keys = ON` (off by default in some hosts)

## Concurrency

- One writer at a time; design for short write transactions
- Don’t share one connection carelessly across threads — follow the embedder’s rules
- For multi-host write needs, move to a server DB

## Safety

- Backup = consistent file copy or `.backup` API while quiesced/WAL-aware
- Never assume multi-process writers are safe without coordination

## Tools

- `sqlite3` CLI; app libraries (stdlib, better-sqlite3, rusqlite, etc.)
