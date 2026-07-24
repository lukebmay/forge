# Git

## Commit and push — only when told

**Do not commit or push without direct instruction to do so.**

| Word | Means |
| --- | --- |
| **commit** | Create a local commit only |
| **push** | Push to remote (only when the user says push) |
| **commit and push** | Both — never invent the push half |

**Commit means commit, not commit and push.** Do not treat “wrap up,” “ship it,” “done,” or finishing a task as implicit permission to commit or push.

### Defaults

- No `git commit`, `git push`, force-push, or amend of published history unless the **current** request clearly asks for that action.
- Prefer preparing the change (diff, status, message draft) and waiting when commit intent is ambiguous.
- After an explicit commit request: still **do not push** unless push was also requested.
- Never push secrets, credentials, or private keys (see `security.md`).
