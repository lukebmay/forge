# Git

Rule vocabulary matches `general.md`: **FIRM** / **GUIDELINE** / **MAY**.

## Word meanings

| Word | Means |
| --- | --- |
| **commit** | Create a **local** commit |
| **push** | Update the remote branch (`git push`) |
| **merge to default** | Merge plan/task branch → `main`/`master` (integration line) |
| **prod** | Production deploy line — **not** automatic; human promotes `master` → `prod` |

Default branch name is whatever the repo uses (`master` or `main`). Below, **default** means that branch. **`prod`** is the deploy branch when the project uses one.

---

## Agent discretion — commit and push (GUIDELINE / FIRM bounds)

Agents **should** commit and push when it is the obvious next step. Do not wait for ritual “please commit and push” when wrap-up is clearly done and the change is safe.

| Situation | Commit? | Push? |
| --- | --- | --- |
| Successful task / plan-slice wrap-up (tests green, docs ok) | **Yes** (local) | **Yes** — push the **plan/task branch** (and default after merge — see below) |
| Mid-task checkpoint that keeps history clear | **Yes** if useful | **Yes** on the feature branch if others need it or the machine is disposable |
| User said don’t commit / don’t push / wait | **No** | **No** |
| Secrets, credentials, or private keys in the diff | **No** | **No** — stop (see `security.md`) |
| Design-flaw stop / A/B not finished | **No** wrap-up commit | **No** |
| Doubt whether the change is ready or would break others | **Local commit OK** to save work | **Do not push default**; ask if unsure |

| Rule | Kind | Detail |
| --- | --- | --- |
| Discretion is default | **GUIDELINE** | Prefer shipping finished work (commit + push feature branch + merge default when rules below are met) over leaving it only on one laptop. |
| User veto wins | **FIRM** | Explicit “don’t commit”, “don’t push”, “no merge”, or “wait” overrides discretion. |
| No secret push | **FIRM** | Never commit or push secrets (see `security.md`). |
| No force-push of published history | **FIRM** | No `--force` / amend of **published** commits unless the user clearly asks. |
| Prefer non-destructive recovery | **GUIDELINE** | If history rewrite seems needed, ask first. |

**Still obvious without magic words:** successful acceptance + wrap-up → commit on the correct branch → push that branch → when merge rules are met, merge to default and push default.

---

## Merge to default (`master` / `main`) — higher bar (FIRM)

Merging into the default branch is a **bigger deal** than commit/push on a feature branch. Default is the integration line other work pulls from.

### When plans merge to default (automatic when ready)

**Plan branches should merge into default when the feature (or finished plan slice that is integration-safe) is complete** — agents do this by default; the user need not say “merge” each time if all gates pass.

| Gate | Required |
| --- | --- |
| **Feature / slice complete** | Acceptance met; not half-done WIP that would break default |
| **Default merged into feature first** | `merge default → plan/<plan>` (or rebase if the project prefers) so the branch is up to date |
| **Tested** | Relevant tests run and green (or explicit reason tests cannot run) |
| **No serious doubt** | Agent is confident the merge is correct |
| **No interference** | Merge is unlikely to block or corrupt **other active branches’** work or the agent queue |

| Rule | Kind | Detail |
| --- | --- | --- |
| Plans auto-merge when gates pass | **FIRM** default | After successful plan-slice wrap-up, merge `plan/<plan>` → default when the table above is satisfied, then **push default**. |
| Whole plan not required | **GUIDELINE** | Prefer merging finished, tested slices rather than waiting for a multi-month plan end — unless the slice is unsafe alone. |
| Doubt → do not merge default | **FIRM** | If unsure, stop after pushing the **feature branch**; report and ask. **Do not** merge or push default. |
| Interference → do not merge default | **FIRM** | If the merge would likely conflict with or break in-flight work on other branches, **do not** merge to default; push feature branch only and note the conflict risk. |
| Standalone tasks | **GUIDELINE** | Same gates for `task/<name>` → default when the task is complete. |

### Order of operations (happy path)

```text
1. On plan/<plan> (or task/<name>): merge default → feature (up to date)
2. Implement + test
3. Commit on feature branch
4. Push feature branch
5. When complete + tested + no doubt/interference:
     merge feature → default
     push default
6. Other open plan/task branches: merge default into them before next work
```

---

## `prod` branch — production deploys (FIRM)

| Branch | Role |
| --- | --- |
| **default** (`master`/`main`) | Integration: finished plans/tasks land here after gates |
| **`prod`** | **Production deploy line** — what is actually released/installed in production |

| Rule | Kind | Detail |
| --- | --- | --- |
| Agents do **not** auto-merge to `prod` | **FIRM** | Never merge default → `prod` (or push `prod`) unless the **user explicitly** asks to promote/deploy to production. |
| Human promotes | **FIRM** | Operator chooses when default is stable enough: merge **default → `prod`**, test, deploy from `prod`. |
| Create if missing | **GUIDELINE** | On first production policy setup, create `prod` from a known-good default commit and push it once. |
| Hotfix on prod | **MAY** | Only if the user directs; prefer fix on default then promote. |

```text
feature → (gates) → default (master) → [human] → prod → deploy
```

---

## Commit policy (detail)

### Default after successful task wrap-up (FIRM)

| Rule | Kind | Detail |
| --- | --- | --- |
| Commit by default | **FIRM** | Local commit on the correct plan/task branch after successful wrap-up. |
| Push feature by default | **GUIDELINE** | After that commit, **push the feature branch** unless user veto, secrets risk, or no remote. |
| Merge default when gates pass | **FIRM** default | See “Merge to default” above — then push default. |
| User opt-out | **FIRM** | Honor don’t-commit / don’t-push / don’t-merge. |
| Nothing to commit | **GUIDELINE** | Clean tree → skip commit; note in handoff. |
| Design-flaw stop | **FIRM** | No wrap-up commit/merge; WIP commit only if user asks. |
| Mid-task commits | **MAY** | Fine for clarity; push feature branch if useful. |

### What is **not** alone a merge-to-default signal

| Phrase / event | Merge default? |
| --- | --- |
| “ship it” / “wrap up” mid-task | Not until acceptance + tests |
| A/B **DISAGREE** | No |
| **DESIGN-FLAW** | No |
| “push” alone | Push current branch if clear; still need merge gates for default |

---

## Branch strategy (plans and tasks)

Goal: default stays the integration line; **`prod` stays deploy**; agents never strand the queue on a side branch.

### Agent queue is default-branch canon (FIRM)

| Path | Role |
| --- | --- |
| `agents/PRIORITY.md` | Ordered next work |
| `agents/HANDOFF.md` | Cross-session handoff (when used) |
| `agents/plans/` | Plans + `completed/` |
| `agents/tasks/` | Active tasks |
| `agents/blockers/` | Human blockers |
| `agents/archive/` | Ship summaries (when used) |

| Rule | Kind | Detail |
| --- | --- | --- |
| Queue lives on default | **FIRM** | Do not leave the only up-to-date queue only on a plan branch. |
| Pull before work | **FIRM** | Merge default → feature before implementing. |
| Pull after default moves | **FIRM** | Active plan/task branches merge default again before the next implement round. |
| No long-lived queue fork | **FIRM** | No private divergent PRIORITY as the real queue. |
| Propagate | **GUIDELINE** | Prefer merge feature → default when gates pass; else queue-only update on default if code must stay isolated. |

### Plan-linked work

| Rule | Kind | Detail |
| --- | --- | --- |
| One branch per plan | **FIRM** | `plan/<plan>` (kebab-case plan id). |
| Create if missing | **FIRM** | From up-to-date default. |
| Switch before implement | **FIRM** | On `plan/<plan>` before Task Force A writes plan code. |
| Stay on plan branch for code | **FIRM** | Implementation commits on `plan/<plan>`. |
| Auto-merge when complete | **FIRM** default | Gates above; then push default. |
| User override | **FIRM** | Honor explicit earlier/later/only-queue instructions. |

### Standalone tasks

| Rule | Kind | Detail |
| --- | --- | --- |
| Branch | **GUIDELINE** | `task/<task-name>` for non-trivial work. |
| Skip branch | **MAY** | Trivial / docs-only / user said work on default. |
| Merge when done | **GUIDELINE** | Same gates as plan slices. |

### Taskforce obligations

| Rule | Kind | Detail |
| --- | --- | --- |
| Check branch first | **FIRM** | Correct plan/task branch before implement. |
| Default is current | **FIRM** | Feature includes latest default before A implements. |
| State in handoff | **FIRM** | Branch, commits, pushes, whether default was merged, whether `prod` was **not** touched. |
| No branch roulette | **FIRM** | One plan/task branch per taskforce, not per A/B round. |
| Spawn prompt safety | **FIRM** | Restate: commit/push feature by discretion; merge default only with gates; **never** auto-merge/push `prod`; no secrets; no SSH without **explicit**. |

### Defaults summary

```text
queue canon:     agents/{PRIORITY,HANDOFF,plans,tasks,blockers,archive} on default
start work:      merge default → plan/<plan> → implement → commit → push feature
plan complete:   default already in feature + tested + no doubt
                 → merge plan → default → push default
other plans:     merge default → their branch before next round
prod:            human only: merge default → prod when deploying
never auto:      force-push published history; secrets; prod promote
doubt/interfere: push feature only; do NOT merge/push default
```
