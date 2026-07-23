# Comments

## Style (strict)

Keep comments **short and non-specific**.

- Prefer one short line or end-of-line.
- Explain *why* only when non-obvious to a reader who does not know this code.
- **Never** restate *what* the next lines clearly do.
- **Never** embed volatile detail: color roles, perf justifications, long purpose parentheticals, goal/history notes, review chat.

Good: `# Grok` · `# Bun` · `# Update check (quiet on no-op)` · `# Secrets`

Bad: `# Grok (PATH/fpath + config symlink; light enough for zshenv)` · long “expensive: …” banners

Design, history, and rationale → `docs/DESIGN.md` (interesting decisions) and
`agents/plans/` (execution plans). **Not** long source comments. See
`documentation.md`.

When touching old verbose comments, trim them in the same change.

## General

- Prefer EOL (`//`, `#`, `--`) over blocks when both exist.
- No emoji in comments unless the code already uses them.
- Minimize arrows (`↑↓←→`); only if they cut real noise.
- Stale comments are worse than none; avoid details likely to rot.
- Prefer clear names/structure over comments; names over ~30 chars hurt readability.
- Math/physics: conventional short names OK with a brief term comment.
- Accurate always: update or delete when code changes.
- Tags: `TODO`, `FIXME`, `NOTE`.

## Audience

**Production:** for other developers — no chat addresses, no session history. Structure, non-obvious logic, external constraints. Light section headers OK.

**Teaching:** more context OK while explaining; if landing in a file, still write production-style comments. Separate “final code” from tutorial narration.
