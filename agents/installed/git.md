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

Goal: keep `main`/`master` stable for integration; implement on long-lived plan branches; **never strand the agent queue on a side branch**.

### Agent queue is default-branch canon (FIRM)

These paths are the **project queue**. Their source of truth is the **default branch** (`main` / `master`):

| Path | Role |
| --- | --- |
| `agents/PRIORITY.md` | Ordered next work |
| `agents/HANDOFF.md` | Short cross-session handoff (when used) |
| `agents/plans/` | Plan docs + `completed/` task archive |
| `agents/tasks/` | Active session tasks |
| `agents/blockers/` | Human blockers |
| `agents/archive/` | Searchable ship summaries (when used) |

| Rule | Kind | Detail |
| --- | --- | --- |
| Queue lives on default | **FIRM** | Do **not** leave the only up-to-date PRIORITY / plan tables / completed-task moves on a plan branch. After wrap-up, get queue updates onto the default branch. |
| Pull before work | **FIRM** | Before implementing on `plan/<plan>` or `task/<name>`, **merge (or rebase) the default branch into the feature branch** so queue docs and other foundations are current. |
| Pull after others land | **FIRM** | When another plan’s work merges to default, active plan/task branches should merge default again before the next implement round (same session if parallel plans moved). |
| No long-lived queue fork | **FIRM** | Never maintain a divergent “private” PRIORITY/plans tree on a feature branch as the real queue. Feature branches may edit queue files during a task, then **propagate via merge to default**. |
| How to propagate | **GUIDELINE** | Prefer **merge the plan/task branch → default** when the shipped code is safe to integrate (finished task, tests green). If code must stay isolated longer, still land **queue-only** updates on default (merge with care, or a short default-branch commit that only updates `agents/` queue paths) so other branches can pull. |
| Merge ≠ push | **FIRM** | Local merge does not authorize `git push`. Push only if the user asked. |

**Why:** Parallel plan branches that each rewrite PRIORITY/HANDOFF without merging default become unmergeable fiction. Default branch is the single queue other agents and humans read.

### Plan-linked work

| Rule | Kind | Detail |
| --- | --- | --- |
| One branch per plan | **FIRM** | For plan `agents/plans/<plan>.md`, use branch `plan/<plan>` (kebab-case plan id, e.g. `plan/shellrc-startup`). |
| Create if missing | **FIRM** | When starting the first task for that plan, create `plan/<plan>` from **up-to-date** default branch if it does not exist (fetch/merge default first). |
| Switch before implement | **FIRM** | Orchestrator and taskforces **must** be on `plan/<plan>` before Task Force A writes code for a plan-linked task. |
| Stay on plan branch for code | **FIRM** | Implementation commits for that plan stay on `plan/<plan>` (not random feature branches). |
| Integrate finished work | **GUIDELINE** | After a **successful task** wrap-up (A/B AGREE or equivalent), prefer merging `plan/<plan>` → default when the change is integration-safe (foundations, green tests). Do **not** wait for the entire multi-task plan if waiting would strand the queue or block other plans. |
| Whole-plan merge still OK | **MAY** | Keep unfinished WIP on the plan branch; merge only the completed task slice (or merge default←plan when the user wants a larger batch). |
| User override | **FIRM** | If the user asks to merge earlier, later, or only queue docs — follow that. |
| Plan rename | **GUIDELINE** | If the plan id changes, rename the branch or open a new `plan/<new>` and note it in the plan doc. |

### Standalone tasks (no plan)

| Rule | Kind | Detail |
| --- | --- | --- |
| Branch for non-trivial work | **GUIDELINE** | Use `task/<task-name>` (kebab-case, from the task file stem) for standalone tasks that change code. |
| Skip branch | **MAY** | Trivial one-liner / docs-only / user said “commit on main” → work on default branch is OK. |
| Merge when task done | **GUIDELINE** | After wrap-up commit on `task/<name>`, merge to default branch when the standalone task is complete (still no push unless asked). Same **pull default first** rule as plan branches. |

### Taskforce obligations

| Rule | Kind | Detail |
| --- | --- | --- |
| Check branch first | **FIRM** | Before implementing, `git branch --show-current` (or equivalent). If wrong, switch/create the plan or task branch — do not implement on the wrong branch. |
| Default is current | **FIRM** | Before A implements: feature branch includes latest default (merge/rebase). After wrap-up: queue (+ usually code) headed for default. |
| State branch in handoff | **FIRM** | Handoff notes include branch name, whether wrap-up commit was made, and whether default was merged / needs merge. |
| No branch roulette | **FIRM** | Do not create random feature branches per A/B round. One plan branch (or one task branch) for the whole taskforce. |

### Defaults summary

```text
queue canon:  agents/{PRIORITY,HANDOFF,plans,tasks,blockers,archive} on default branch
start work:   merge default → plan/<plan> (or task/<name>) → implement
wrap-up:      commit on plan/task branch → merge to default when safe (prefer per finished task)
other plans:  after default moves, merge default → their plan branch before next round
always:       push only if user asked
design flaw:  stop; no wrap-up commit
```
