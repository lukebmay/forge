# Human blockers

Work that **only a human** can do, and that **blocks** agent work until done.

These files are **for humans**. Write them so a person can act and tick boxes
while reading top→bottom. Do not dump agent prep, hunt recipes, or post-read
report protocols here — that belongs in HANDOFF / plan notes.

| Rule | Detail |
| --- | --- |
| Agents | Do **not** implement these. Create/update files here when blocked. |
| Humans | Check boxes / mark `**Status:** done` and move to `completed/` when finished. |
| CLI | `agents blockers` · `agents priorities` |

See catalog `general.md` (Human blockers) and `documentation.md` § Audience.

Template:

```markdown
# B-short-id — Title

**Status:** open
**Difficulty:** hard | soft
**Owner:** human
**Kind:** design | permission | verify | credentials | expensive-test | other
**Plan:** (none) | plan-id
**Unblocks:** agents/plans/…
**Priority:** P0
**Created:** YYYY-MM-DD
**Updated:** YYYY-MM-DD

## Why this is human-only

(one short sentence)

## What the human must do

1. …
1. …
   - [ ] …
```
