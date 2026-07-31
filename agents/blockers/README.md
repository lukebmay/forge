# Human blockers

Work that **only a human** can do. Not every open question is a blocker.

## Hard vs soft (project + catalog)

| Severity | Field | Agent behavior |
| --- | --- | --- |
| **hard** | `**Severity:** hard` (or omit — **default**) | Task must be `blocked` + linked here. Taskforces **skip**. Orchestrator reports at stop. |
| **soft** | `**Severity:** soft` | Optional product/design/ops queue. Agents **do not** treat as session-wide stop. Skip only work that *depends* on the decision; continue eligible tasks. Prefer plan “Open decisions” over soft blockers when nothing is waiting. |

| Rule | Detail |
| --- | --- |
| **Hard only when required** | File a hard blocker only if an agent **must not** proceed alone on a *required* path. |
| **Soft is optional** | Soft items are reminders (design lock later, nice-to-have QA). They must not look like P0 gates. |
| **Park, don’t fake-block** | Optional work with no near-term intent → close as **parked** in `completed/`, not leave open soft forever. |
| Agents | Do **not** implement hard blockers. Soft: implement only if the task is finalized and in scope. |
| Humans | Check boxes / mark `**Status:** done` or **parked** and move to `completed/` when finished. |
| CLI | `agents blockers` · `agents priorities` |
| Dates | Set **Created** on open; bump **Updated** on material edits. |

See catalog `general.md` (Human blockers) for kinds (design, permission, verify, …).

Template:

```markdown
# B-short-id — Title

**Status:** open
**Severity:** hard | soft
**Owner:** human
**Kind:** design | permission | verify | credentials | physical | expensive-test | other
**Plan:** (none) | plan-id
**Unblocks:** agents/tasks/some-task.md
**Priority:** P0
**Created:** YYYY-MM-DD
**Updated:** YYYY-MM-DD

## What the human must do
- [ ] …

## Done when
…
```

Default severity is **hard** if the field is missing (legacy files).
