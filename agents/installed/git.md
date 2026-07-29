# Git

Rule vocabulary matches `general.md`: **FIRM** / **GUIDELINE** / **MAY**.

## Word meanings

| Word | Means |
| --- | --- |
| **commit** | Create a **local** commit only |
| **push** | Push to remote (only when the user says push) |
| **commit and push** | Both — never invent the push half |

## Push — only when told (FIRM)

| Rule | Kind | Detail |
| --- | --- | --- |
| No unsolicited push | **FIRM** | Do not run `git push` (or force-push) unless the **current** user request clearly asks to push. |
| Commit ≠ push | **FIRM** | “Commit” never implies push. |
| No rewrite published history | **FIRM** | No force-push or amend of **published** history unless the current request clearly asks for that action. |
| No secret push | **FIRM** | Never commit or push secrets, credentials, or private keys (see `security.md`). |

## Commit policy

### Default after successful task wrap-up (FIRM)

When a task **successfully** completes (taskforce A/B **AGREE**, or equivalent single-agent success) and wrap-up (docs/tests/comments as applicable) is done:

| Rule | Kind | Detail |
| --- | --- | --- |
| Commit by default | **FIRM** | Create a **local** commit on the correct plan/task branch. This is authorized by these agents rules — the user does **not** need to say “commit” each time for that wrap-up commit. |
| Still no push | **FIRM** | Wrap-up commit does **not** authorize push. |
| User opt-out | **FIRM** | If the user said “don’t commit”, “no commit”, or “wait before committing”, do **not** commit. |
| Nothing to commit | **GUIDELINE** | If the working tree is clean after wrap-up, skip commit and note that in the handoff. |
| Design-flaw stop | **FIRM** | Do **not** wrap-up-commit when stopping for a design discussion (see `general.md`). Commit WIP only if the user asks. |
| Mid-task commits | **MAY** | Extra local commits during a long task are fine when they keep history clear; still no push. |
| Explicit commit request | **FIRM** | If the user says “commit” mid-session, commit as asked (still no push unless they also said push). |

### What is **not** a commit signal

| Phrase / event | Commit? |
| --- | --- |
| “ship it” / “wrap up” / “done” (without task success wrap-up) | Not by itself — finish acceptance first |
| A/B **DISAGREE** or in-progress rounds | No wrap-up commit yet |
| **DESIGN-FLAW** stop | No wrap-up commit |
| “push” alone | Push only if clearly requested; still need something to push |

## Branch strategy (plans and tasks)

Goal: keep `main`/`master` stable; land plan work on a long-lived plan branch; merge when the **plan** is complete (not after every task).

### Plan-linked work

| Rule | Kind | Detail |
| --- | --- | --- |
| One branch per plan | **FIRM** | For plan `agents/plans/<plan>.md`, use branch `plan/<plan>` (kebab-case plan id, e.g. `plan/shellrc-startup`). |
| Create if missing | **FIRM** | When starting the first task for that plan, create `plan/<plan>` from up-to-date `main`/`master` (or the repo’s default branch) if it does not exist. |
| Switch before implement | **FIRM** | Orchestrator and taskforces **must** be on `plan/<plan>` before Task Force A writes code for a plan-linked task. |
| Stay on plan branch | **FIRM** | All tasks for that plan commit to `plan/<plan>` until the plan is complete. |
| Merge when plan complete | **FIRM** | Merge `plan/<plan>` → default branch only when the **plan** is complete (or the user asks to merge earlier). Do **not** merge after each task by default. |
| Merge ≠ push | **FIRM** | Local merge does not authorize `git push`. Push only if the user asked. |
| Plan rename | **GUIDELINE** | If the plan id changes, rename the branch or open a new `plan/<new>` and note it in the plan doc. |

### Standalone tasks (no plan)

| Rule | Kind | Detail |
| --- | --- | --- |
| Branch for non-trivial work | **GUIDELINE** | Use `task/<task-name>` (kebab-case, from the task file stem) for standalone tasks that change code. |
| Skip branch | **MAY** | Trivial one-liner / docs-only / user said “commit on main” → work on default branch is OK. |
| Merge when task done | **GUIDELINE** | After wrap-up commit on `task/<name>`, merge to default branch when the standalone task is complete (still no push unless asked). |

### Taskforce obligations

| Rule | Kind | Detail |
| --- | --- | --- |
| Check branch first | **FIRM** | Before implementing, `git branch --show-current` (or equivalent). If wrong, switch/create the plan or task branch — do not implement on the wrong branch. |
| State branch in handoff | **FIRM** | Handoff notes include branch name and whether wrap-up commit was made. |
| No branch roulette | **FIRM** | Do not create random feature branches per A/B round. One plan branch (or one task branch) for the whole taskforce. |

### Defaults summary

```text
plan work:    checkout plan/<plan> → A/B tasks → commits on plan branch → merge when plan done
standalone:   checkout task/<task> (non-trivial) → work → commit → merge when task done
always:       push only if user asked
design flaw:  stop; no wrap-up commit
```
