# Human blockers

Work that **only a human** can do, and that **blocks** agent tasks until done.

| Rule | Detail |
| --- | --- |
| Agents | Do **not** implement these. Create/update files here when blocked. |
| Humans | Check boxes / mark `**Status:** done` and move to `completed/` when finished. |
| CLI | `agents blockers` · `agents priorities` |

See catalog `general.md` (Human blockers) for what belongs here vs agent tasks.

Template:

```markdown
# B-short-id — Title

**Status:** open
**Owner:** human
**Kind:** design | permission | verify | credentials | physical | expensive-test | other
**Plan:** (none) | plan-id
**Unblocks:** agents/tasks/some-task.md
**Priority:** P0

## What the human must do
- [ ] …

## Done when
…
```
