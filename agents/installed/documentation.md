# Documentation

## Design decisions → durable “why”

Record **interesting design decisions** so humans and agents can onboard, and so
you can generate **retrospectives** for colleagues or clients without replaying
chat logs.

### Two layers (GUIDELINE)

| Doc | Role | Token stance |
| --- | --- | --- |
| **`docs/DESIGN.md`** | Architecture narrative, metaphors, how the system fits together | Readable prose; keep current |
| **`docs/DECISIONS.md`** | **Append-friendly decision log** — compact, categorized, importance-tagged | **Minimal tokens**; default place for meeting outcomes |

Create either file if missing. Prefer updating **DECISIONS** when a choice is made;
expand **DESIGN** when the reader needs the full picture.

| Put it in DESIGN / DECISIONS when… | Keep it out when… |
| --- | --- |
| A future reader would ask *why* | Pure task checklist / session scratch |
| Tradeoffs, rejected alternatives | Volatile “next commit” TODOs |
| Architecture constraints that unlock the codebase | API laundry lists better as code |
| Lessons from production bugs | Secrets, deploy hosts, private URLs |

Tone in DESIGN: clear, opinionated, light wit OK.  
Tone in DECISIONS: **telegraphic** — one line why; link out if needed.

### DECISIONS.md format (FIRM shape when the file exists)

Keep one file (or `docs/decisions/INDEX.md` + rare long entries). Default:

```markdown
# Design decisions

**How to use:** scan by Topic / Imp. Update in place when a decision changes;
set Status=`superseded` and add a new row (do not rewrite history silently).

| ID | Date | Topic | Imp | Status | Decision | Why |
| --- | --- | --- | --- | --- | --- | --- |
| D001 | 2026-08-01 | deploy | P0 | active | All-in-one process default | Zero-config campus run |
```

| Field | Rules |
| --- | --- |
| **ID** | Stable `D###` (or `D-topic-###`); never reuse for a different decision |
| **Date** | ISO date of decision (or last material change) |
| **Topic** | Short kebab or word: `deploy`, `auth`, `api`, `testing`, `modules`, … |
| **Imp** | `P0` architecture / security · `P1` product default · `P2` implementation · `P3` note |
| **Status** | `active` \| `superseded` \| `rejected` |
| **Decision** | What we chose (≤ ~12 words) |
| **Why** | One line; no essay |

Optional: `Supersedes` column or `see D014` in Why.  
Long rationale only when needed: `docs/decisions/D001-short-slug.md` and link from the row.

### Retrospectives (GUIDELINE)

To share with colleagues/clients, filter DECISIONS:

```text
Topic in {deploy,auth,api} AND Imp ≤ P1 AND Status=active
```

Emit a short markdown summary (table or bullets). Do **not** paste agent transcripts.
Agents: when asked for a retrospective, **read DECISIONS (+ DESIGN headings)** only
unless the user asks for plan/archive detail.

### What goes where

| Doc | Role |
| --- | --- |
| **`docs/DESIGN.md`** | Durable narrative “why” |
| **`docs/DECISIONS.md`** | Compact decision log (retro source) |
| **`agents/plans/`** | Execution plans, task tables, session handoffs |
| **`agents/tasks/`** | Session-sized work; acceptance; short notes |
| **`agents/archive/`** | Searchable summaries after ship (when used) |
| **Source comments** | Minimal *why* only — see `comments.md` |

When a task ships a non-obvious choice, **add/update a DECISIONS row** (and DESIGN
if the narrative changed) in the same change or wrap-up commit. Do not leave the
only explanation in chat or a completed task file.

### Hygiene

- Prefer short titled sections in DESIGN over one giant essay.
- DECISIONS stays table-first; archive superseded rows, don’t delete without reason.
- Link to tasks/archive when useful; do not duplicate full task checklists.
- Update or delete stale claims when code changes.
- No secrets; no real credentials (see `security.md`).
