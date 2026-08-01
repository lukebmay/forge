# Git

Rule vocabulary matches `general.md`: **FIRM** / **GUIDELINE** / **MAY**.

## Word meanings

| Word | Means |
| --- | --- |
| **commit** | Create a **local** commit |
| **push** | Update a remote branch (`git push`) — only if a working `origin` exists (see Push / remotes) |
| **merge to default** | Merge plan/task branch → `main`/`master` (dev / integration line) |
| **promote** | Human merge along the release ladder: default → `test` → `prod` |

Default branch name is whatever the repo uses (`master` or `main`). Below, **default** means that branch.

---

## Release ladder (professional default for this stack)

### Recommended layout

```text
plan/* / task/*  →  master (dev / alpha RC)  →  test  →  prod
                         ↑ agent merge when gated      ↑ human only
```

| Branch | Role | Who advances it |
| --- | --- | --- |
| **`plan/*` / `task/*`** | Feature work | Agents (discretion commit/push) |
| **`master` / `main`** | **Dev / integration** — continuous alpha release candidate; finished plans land here | Agents when merge gates pass |
| **`test`** | **Staging / QA** — candidate for production after automated + manual checks | **Human** (or explicit user ask) after master looks good |
| **`prod`** | **Production** — what is installed/released live; **must lag** until deliberately promoted | **Human only** after `test` passes |

This matches common **environment-branch** practice (dev → staging → production). It is reasonable and professional for personal infra, small teams, and multi-machine deploys (shellrc, network tools, websites).

### Do you need `master → alpha → test → prod`?

| Extra **`alpha` branch** | Verdict |
| --- | --- |
| Permanent `alpha` between master and test | **Usually skip** — master already *is* the alpha/dev line. A fourth long-lived branch adds merge churn without a separate deploy channel. |
| Public “alpha users” channel | **MAY** add `alpha` (or tags `v*-alpha`) only if you actually ship that channel. |
| Release candidates | Prefer **tags** on `test`/`prod` (`v1.2.0-rc.1`, `v1.2.0`) over more permanent branches. |

**Default policy for shellrc-style repos: three rungs — `master` → `test` → `prod`.**  
Not: four permanent rungs unless product needs a distinct alpha deploy.

### Lag and promotion (FIRM for agents)

| Rule | Kind | Detail |
| --- | --- | --- |
| **`prod` lags** | **FIRM** | `prod` is not fast-forwarded by agents when master moves. Production stays on the last human promotion until the operator promotes again. |
| **`test` may track master closer** | **GUIDELINE** | Human promotes master → `test` when ready for QA; agents do not auto-promote. |
| **Agents never auto-merge `test` or `prod`** | **FIRM** | Never merge master → `test`/`prod` or push those branches unless the **user explicitly** asks to promote/deploy. |
| **Promote order** | **GUIDELINE** | Prefer **master → `test`** (validate) → then **`test` → `prod`** (or master → prod only if user skips test and accepts risk). |
| **Hotfix on prod** | **MAY** | Only if user directs; prefer fix on master → test → prod. |

```text
feature → (gates) → master          # agents
master  → [human] → test            # QA / staging
test    → [human] → prod            # production (lags)
```

### Alternatives (when to use something else)

| Model | When it fits |
| --- | --- |
| **Trunk-based + tags** | High-frequency deploys; `main` always releasable; tags mark prod. Less need for long-lived `test`/`prod` branches. |
| **GitHub Flow** | Single `main` + PRs; deploy from main. Fine for pure apps with one environment. |
| **This ladder (master/test/prod)** | Multiple machines/environments, careful prod lag, agent-heavy integration on master — **preferred here**. |

---

## Push / remotes (FIRM)

| Rule | Kind | Detail |
| --- | --- | --- |
| **No origin → no push** | **FIRM** | If the repo has **no** `origin` remote (or `git remote get-url origin` fails), **skip push entirely**. Local commit only. Do not invent remotes. |
| **Broken / unauthenticated origin** | **FIRM** | If push fails for access/auth/network, report once, keep local commits, do **not** loop or treat as fatal to the task unless the user required a remote ship. |
| **“Push” means products with a working origin** | **FIRM** | When the user says “push” (or agents push by discretion), that applies **only** to repos that have a working `origin`. Local-only repos (e.g. private life notes without remote) are **ignored for push**. |
| **Check before push** | **GUIDELINE** | `git remote get-url origin` (or equivalent) before `git push`. |

---

## Agent discretion — commit and push (GUIDELINE / FIRM bounds)

Agents **should** commit and push when it is the obvious next step **and** a remote exists. Do not wait for ritual “please commit and push” when wrap-up is clearly done and the change is safe.

| Situation | Commit? | Push? |
| --- | --- | --- |
| Successful task / plan-slice wrap-up (tests green, docs ok) | **Yes** (local) | **Yes** if origin works — feature branch (+ default after merge) |
| Mid-task checkpoint | **Yes** if useful | **Yes** on feature branch if origin works and others need it |
| No working `origin` | **Yes** if wrap-up warrants | **No** — skip push silently (or one-line note in handoff) |
| User said don’t commit / don’t push / wait | **No** | **No** |
| Secrets in the diff | **No** | **No** — stop (see `security.md`) |
| Design-flaw / A/B unfinished | **No** wrap-up | **No** |
| Doubt about readiness or interference | **Local commit OK** | **Do not push/merge default**; ask if unsure |

| Rule | Kind | Detail |
| --- | --- | --- |
| Discretion is default | **GUIDELINE** | Prefer shipping finished work (commit + push feature + merge default when gates pass) when origin works. |
| User veto wins | **FIRM** | Explicit “don’t commit/push/merge” overrides discretion. |
| No secret push | **FIRM** | Never commit or push secrets. |
| No force-push of published history | **FIRM** | No `--force` / amend of **published** commits unless the user clearly asks. |

**Still obvious without magic words:** acceptance + wrap-up → commit → push feature (if origin) → merge default when gates pass → push default (if origin). Never auto-touch `test`/`prod`.

---

## Merge to default (`master` / `main`) — higher bar (FIRM)

Default is **dev integration** (alpha RC), not production. Merging into default is still a bigger deal than feature-branch push because other work pulls from it.

### When plans merge to default (automatic when ready)

**Plan branches should merge into default when the feature (or finished integration-safe slice) is complete** — agents do this by default when gates pass.

| Gate | Required |
| --- | --- |
| **Feature / slice complete** | Acceptance met; not half-done WIP that would break default |
| **Default merged into feature first** | `merge default → plan/<plan>` (or rebase if the project prefers) |
| **Tested** | Relevant tests green (or explicit reason they cannot run) |
| **No serious doubt** | Agent is confident |
| **No interference** | Unlikely to block/corrupt other active branches or the agent queue |

| Rule | Kind | Detail |
| --- | --- | --- |
| Plans auto-merge when gates pass | **FIRM** default | Merge `plan/<plan>` → default, then push default **if origin works**. |
| Whole plan not required | **GUIDELINE** | Prefer finished tested slices over waiting for a multi-month plan end — unless the slice is unsafe alone. |
| Doubt → do not merge default | **FIRM** | Push feature only (if origin); report and ask. |
| Interference → do not merge default | **FIRM** | Push feature only; note conflict risk. |
| Standalone tasks | **GUIDELINE** | Same gates for `task/<name>` → default. |

### Order of operations (happy path)

```text
1. On plan/<plan> (or task/<name>): merge default → feature
2. Implement + test
3. Commit on feature branch
4. Push feature branch (if origin works)
5. When complete + tested + no doubt/interference:
     merge feature → default
     push default (if origin works)
6. Other open plan/task branches: merge default into them before next work
7. Human later: master → test → (pass) → prod
```

---

## `test` and `prod` — staging and production (FIRM)

| Branch | Role |
| --- | --- |
| **`test`** | Staging / QA line; receives promotions from master when the human wants validation |
| **`prod`** | Production deploy line; **lags** until human promotes after test (or explicit skip) |

| Rule | Kind | Detail |
| --- | --- | --- |
| Agents do **not** auto-promote | **FIRM** | Never merge to `test` or `prod`, and never push them, unless the user **explicitly** asks to promote/deploy. |
| Create if missing | **GUIDELINE** | On first setup: create `test` and `prod` from a known-good default (or leave uncreated until first promote). Push once if origin works. |
| `prod` lag is intentional | **FIRM** | Do not “catch prod up” to master during routine plan merges. |

---

## Commit policy (detail)

### Default after successful task wrap-up (FIRM)

| Rule | Kind | Detail |
| --- | --- | --- |
| Commit by default | **FIRM** | Local commit on the correct plan/task branch after successful wrap-up. |
| Push feature by default | **GUIDELINE** | Push feature branch if origin works. |
| Merge default when gates pass | **FIRM** default | Then push default if origin works. |
| User opt-out | **FIRM** | Honor don’t-commit / don’t-push / don’t-merge. |
| Nothing to commit | **GUIDELINE** | Clean tree → skip; note in handoff. |
| Design-flaw stop | **FIRM** | No wrap-up commit/merge. |
| Mid-task commits | **MAY** | Fine for clarity; push feature if origin works and useful. |

### What is **not** alone a merge-to-default signal

| Phrase / event | Merge default? |
| --- | --- |
| “ship it” / “wrap up” mid-task | Not until acceptance + tests |
| A/B **DISAGREE** | No |
| **DESIGN-FLAW** | No |
| “push” alone | Push current branch if origin works; still need merge gates for default |
| “deploy” / “prod” | Human promote path — not automatic plan merge |

---

## Branch strategy (plans and tasks)

Goal: **master** stays the agent integration line; **`test`/`prod` stay human-promoted**; never strand the queue on a side branch.

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

### Plan-linked work

| Rule | Kind | Detail |
| --- | --- | --- |
| One branch per plan | **FIRM** | `plan/<plan>` (kebab-case plan id). |
| Create if missing | **FIRM** | From up-to-date default. |
| Switch before implement | **FIRM** | On `plan/<plan>` before plan code lands. |
| Stay on plan branch for code | **FIRM** | Implementation commits on `plan/<plan>`. |
| Auto-merge to master when complete | **FIRM** default | Gates above; never auto-merge to `test`/`prod`. |
| User override | **FIRM** | Honor explicit earlier/later/only-queue instructions. |

### Standalone tasks

| Rule | Kind | Detail |
| --- | --- | --- |
| Branch | **GUIDELINE** | `task/<task-name>` for non-trivial work. |
| Skip branch | **MAY** | Trivial / docs-only / user said work on default. |
| Merge when done | **GUIDELINE** | Same gates as plan slices → default only. |

### Taskforce obligations

| Rule | Kind | Detail |
| --- | --- | --- |
| Check branch first | **FIRM** | Correct plan/task branch before implement. |
| Default is current | **FIRM** | Feature includes latest default before A implements. |
| State in handoff | **FIRM** | Branch, commits, pushes (or “no origin”), whether default was merged, that **`test`/`prod` were not touched**. |
| No branch roulette | **FIRM** | One plan/task branch per taskforce. |
| Spawn prompt safety | **FIRM** | Restate: commit/push feature by discretion if origin works; merge default only with gates; **never** auto-promote `test`/`prod`; no secrets; no SSH without **explicit**. |

### Defaults summary

```text
queue canon:     agents/* queue on master (dev)
start work:      merge master → plan/<plan> → implement → commit → push feature (if origin)
plan complete:   master already in feature + tested + no doubt
                 → merge plan → master → push master (if origin)
other plans:     merge master → their branch before next round
test / prod:     human only: master → test → (pass) → prod (prod lags)
no origin:       commit locally; skip all pushes
never auto:      force-push published history; secrets; test/prod promote
doubt/interfere: push feature only; do NOT merge/push master
```
