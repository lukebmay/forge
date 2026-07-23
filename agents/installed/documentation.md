# Documentation

## Design decisions → `docs/DESIGN.md`

Record **interesting design decisions** in project-root
`docs/DESIGN.md` (create the file if missing).

| Put it in DESIGN.md when… | Keep it out when… |
| --- | --- |
| A future reader would ask *why* we did it this way | Pure task checklist / session scratch |
| Tradeoffs, rejected alternatives, funny constraints | Volatile “next commit” TODOs |
| Architecture metaphors that unlock the codebase | API laundry lists better as code |
| Lessons from production bugs | Secrets, deploy hosts, private URLs |

Tone: **interesting and entertaining for developers** — clear, opinionated,
light wit OK. Not a marketing page; not a changelog dump.

### What goes where

| Doc | Role |
| --- | --- |
| **`docs/DESIGN.md`** | Durable “why” for humans (and agents onboarding) |
| **`agents/plans/`** | Execution plans, task tables, session handoffs |
| **`agents/tasks/`** | Session-sized work; acceptance; short notes |
| **`agents/archive/`** | Searchable summaries after ship (when the project uses it) |
| **Source comments** | Minimal *why* only — see `comments.md` |

When a task ships a non-obvious choice, **update DESIGN.md in the same
change** (or the wrap-up commit). Do not leave the only explanation in chat
or a completed task file.

### Hygiene

- Prefer short titled sections over one giant essay.
- Link to tasks/archive when useful; do not duplicate full task checklists.
- Update or delete stale claims when code changes.
- No secrets; no real credentials (see `security.md`).
