# General Agent Guidelines

## Rule vocabulary (read first)

These labels are **not** style fluff. Use them to decide when judgment is allowed.

| Label | Meaning |
| --- | --- |
| **FIRM** | Must follow. No “helpful” exceptions. Escalate or stop if you cannot comply. |
| **GUIDELINE** | Default practice. Override only with a clear reason (user request, plan, or lower risk). |
| **MAY** | Optional. Do it when it helps; skip when it does not. |

If a rule is not labeled, treat security, git commit/push, secrets, and SSH rules as **FIRM**; treat process and style defaults as **GUIDELINE**.

Follow `agents/` as needed. Do **not** load every file up front — the project composer (`agents.py` / `agents build`) assembles the stable core into root `AGENTS.md`. Examples of portable fragments: `security.md`, `git.md`, `scripting.md`, `comments.md`, `documentation.md`, `testing.md`, `ansi-colors.md`, `markdown.md`. Design narrative: `docs/DESIGN.md`. Compact decision log (retros): `docs/DECISIONS.md` — see `documentation.md`.

### AGENTS.md must auto-load (FIRM for project setup)

Grok (and compatible tools) discover root `AGENTS.md` as project instructions **only if the file is not gitignored**.

| Rule | Detail |
| --- | --- |
| **FIRM** | Do **not** list `AGENTS.md` in `.gitignore` / `.git/info/exclude` if agents should auto-load rules. |
| **FIRM** | After fragment changes, run `agents build` (or `python3 agents.py build`) so root `AGENTS.md` matches `agents/installed/` + overrides. |
| **GUIDELINE** | Keep `AGENTS.md` = stable core only (`--preset=core`). Load plans/tasks on demand. |
| **GUIDELINE** | Verify with `grok inspect` → Project Instructions should list `AGENTS.md`. |

Subagents receive a **compacted** copy of loaded project instructions. That is not a guarantee of every detail. For taskforces, restate **FIRM** safety rules and task acceptance in the spawn prompt (see Taskforce).

## Installed vs user overrides (precedence)

Portable guidelines are **managed** under `agents/installed/` (installed/updated by the shellrc `agents` CLI).

| Path | Role |
| --- | --- |
| `agents/installed/<path>.md` | Catalog copy — managed; restore with `agents update` |
| `agents/<path>.md` | **User override** — same relative path; project-local edits live here |
| `agents/project.md` | Project-only notes (always user) |
| `agents/plans/`, `agents/tasks/` | Session work (always user) |

| Rule | Detail |
| --- | --- |
| **FIRM** | Do **not** edit files under `agents/installed/`. Use `agents edit <name>` → `agents/<path>.md`. |
| **FIRM** | When both installed and user override exist: read installed first, user **last**; **user wins** on conflict. |

Compose order in `AGENTS.md` follows the same rule (user override sections are labeled `… (user)` and appear after the managed copy). Accidental edits of `installed/` are reclaimed into user overrides by `agents update` / `agents reclaim`.

**Language / stack style (GUIDELINE):** when relevant, read `agents/languages/<name>.md` and any matching user override under `agents/languages/`. **Project** style/formatter/LSP configs always win over those defaults.

## No leftover residue

| Rule | Detail |
| --- | --- |
| **FIRM** | Before finishing, remove temporary and failed-attempt residue from code, configs, and the live environment you touched. |

Remove:

- Paths/imports to `/tmp/...`, scratch clones, ephemeral dirs
- Dummy data, fake commits, debug prints, test-only flags in real paths
- Installer/dotfile targets rewritten to temp or non-real paths
- Temp files, stamps, or fixtures left unrestored
- **Debug / diagnostic / exploration code** added while solving — strip it once the real fix lands, unless the product intentionally needs it or the task **explicitly** asks for lasting diagnostics
- **Failed attempts:** when a later fix supersedes earlier tries, remove dead code from *every* place those attempts touched, not only the final file

Search the diff and smoke-check real paths you touched.

## Backwards compatibility (while in development)

| Rule | Detail |
| --- | --- |
| **GUIDELINE** | Do **not** preserve backwards compatibility by default during active development. |

Rename APIs, flip defaults, and drop shims freely unless there is a clear reason to keep the old surface — primarily **real-world users** already depending on a released version. Pre-release / private / “we have not shipped this publicly” work does **not** need compatibility with its own prior experiments (names, flags, config paths, schemas). Prefer a clean break over dual paths and deprecation theater.

## Tasks

Session-sized work lives in `agents/tasks/`. Prefer one completable session. Tasks often implement one slice of a plan.

| Rule | Detail |
| --- | --- |
| **FIRM** Active path | Always `agents/tasks/<name>.md` while in progress or ready |
| **FIRM** Naming | kebab-case |
| **FIRM** Plan-linked name | `{plan}_{task}.md` (e.g. plan `shellrc-startup.md` → task `shellrc-startup_c1-c3.md`) |
| **GUIDELINE** Standalone name | No plan prefix required (e.g. `scripts-agentsmd.md`) |
| **FIRM** Done (plan-linked) | Move to `agents/plans/<plan>/completed/` — **not** `agents/tasks/completed/` |
| **FIRM** Done (standalone) | Move to `agents/tasks/completed/` only when the task has **no** plan |
| **GUIDELINE** Status in task/plan | Label clearly: `ready` / `in progress` / `blocked` / `optional` / `draft` (unfinalized). Taskforces skip `optional` and `draft` unless the user says otherwise (see Taskforce eligibility). |
| **FIRM** Human blockers | When agent work needs a human first, create/link `agents/blockers/` (see **Human blockers**). Do not only write “blocked” prose in the task. |

Examples:

| Kind | Active path | Completed path |
| --- | --- | --- |
| Plan-linked | `agents/tasks/displays-live-set_c-multigroup-aliases.md` | `agents/plans/displays-live-set/completed/displays-live-set_b-set-modes.md` |
| Plan-linked | `agents/tasks/shellrc-startup_….md` | `agents/plans/shellrc-startup/completed/shellrc-startup_b1.md` |
| Standalone | `agents/tasks/scripts-agentsmd.md` | `agents/tasks/completed/scripts-agentsmd.md` |

When finishing a plan-linked task: update acceptance + session note, move the file under that plan’s `completed/`, point the plan’s “next task” at the following slice, and fix any stale path refs.

| Rule | Detail |
| --- | --- |
| **FIRM** | When code changes, update the task with a brief progress note after each prompt. One note per session. **Overwrite** and re-summarize — do not pile notes. |

### Archive (searchable summaries)

Finished work also gets a **high-level** entry under `agents/archive/`:

| Path | Role |
| --- | --- |
| `agents/archive/INDEX.md` | One-line table (tags, dates, links) — **search here first** |
| `agents/archive/entries/<slug>.md` | Design choices, why, major problems |
| `agents/PRIORITY.md` | Active ordered queue (not archive) |

| Rule | Detail |
| --- | --- |
| **FIRM** | Do not delete completed task/plan files when archiving; archive is the summary layer only. |

Cross-repo priorities: `~/dev/me/life/agents/PRIORITY-BOARD.md`.

## Human blockers

**Purpose:** a clear, portable queue of work that **only a human** can do.
Not every open question is a blocker. Prefer plan “open decisions” when nothing
is waiting on a required path. This is for open-source / multi-user projects —
do **not** hardcode a personal name; use **human** / **operator**.

### Hard vs soft (FIRM for agents)

| Severity | Field | Agent behavior |
| --- | --- | --- |
| **hard** | `**Severity:** hard` (or **omit** — default) | Required path stopped. Task must be `**Status:** blocked` + linked. Taskforces **skip** that task. Orchestrator reports hard open items at stop. |
| **soft** | `**Severity:** soft` | Optional product/design/ops reminder. Does **not** stop the whole queue. Skip only work that *depends* on the decision; continue other eligible tasks. |

| Rule | Detail |
| --- | --- |
| **Hard only when required** | File hard only if an agent **must not** proceed alone on a *required* path. |
| **Soft is optional** | Soft items must not look like P0 gates. Prefer soft (or no file) for “someday design.” |
| **Park, don’t fake-block** | Optional work with no near-term intent → `**Status:** parked` or `done` and move to `completed/`, not leave open soft forever. |

### Layout

| Path | Role |
| --- | --- |
| `agents/blockers/<id>.md` | **Portable default** — one open human action per file |
| `agents/blockers/completed/` | Done human items (optional archive) |
| `human-tasks/` (project root) | **Also scanned** — legacy / large operator checklists (e.g. network inventories) |

CLI: `agents blockers [plan]` · `agents tasks` · `agents plans` · `agents priorities`.

### What counts as human work (FIRM)

Put an item in blockers **only** if an agent **must not** do it alone:

| Kind | Examples |
| --- | --- |
| **design** | Major product/architecture decisions; plan reshape approval |
| **permission** | Explicit SSH/sudo/remote access; shared-infra blast-radius consent |
| **credentials** | Subscribe/buy services; export secrets the agent must not invent; account logins |
| **physical / environment** | Unplug NICs, hardware, on-site checks, “use this machine while looking at the screen” |
| **expensive-test** | Long manual QA matrices, multi-host live cutovers, paid cloud burn the human owns |
| **verify** | Operator confirmation after an agent fix (e.g. offline re-verify) |
| **data-only-human** | Private dumps the human must supply; agent must not fabricate |

### What is **not** a human blocker (FIRM)

| Not a blocker | Do instead |
| --- | --- |
| “Human-readable” docs/UI | Agent task |
| Ordinary unit/integration tests agents can run | Agent task |
| Agent needs more research | `explore` / agent task |
| Optional polish | Optional agent task — not a blocker |
| Naming someone personally | Use **human** / **operator** |

### File template (GUIDELINE — keep fields parseable)

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

| Field | Notes |
| --- | --- |
| **Severity** | Default **hard** if missing (legacy). Prefer explicit. |
| **Created** | Date the file was first opened (YYYY-MM-DD). |
| **Updated** | Bump when status, severity, checklist, or unblocks change. |

### Agent rules

| Rule | Kind | Detail |
| --- | --- | --- |
| Create when blocked | **FIRM** | If a **required** path cannot proceed without a human, write/update a **hard** blocker and set the agent task `**Status:** blocked` + `**Blocker:** agents/blockers/<id>.md`. Soft items do **not** require task `blocked`. |
| Do not fake human steps | **FIRM** | Never mark a human blocker done, never invent “operator approved,” never SSH/sudo past permission rules. |
| Skip blocked tasks | **FIRM** | Taskforces skip tasks with `**Status:** blocked` or linked **hard** open blockers (see eligibility). Soft open blockers alone do not block unrelated tasks. |
| Dual queue | **GUIDELINE** | Prefer `agents/blockers/` for new portable projects. Keep using root `human-tasks/` where it already exists; CLI lists both. |
| Close blockers | **GUIDELINE** | Human sets `**Status:** done` / `parked` and/or moves file to `blockers/completed/`. Agent may move only when the human explicitly said the blocker is done or parked. |
| Dates | **GUIDELINE** | Set **Created** on open; bump **Updated** on material edits. |

## Plans

Plans live in `agents/plans/` as kebab-case **files** (`agents/plans/<plan>.md`). Read only when the current task needs them.

| Layout | Path |
| --- | --- |
| Plan doc | `agents/plans/<plan>.md` |
| Completed tasks for that plan | `agents/plans/<plan>/completed/*.md` |
| Active tasks for that plan | `agents/tasks/<plan>_….md` (still under tasks/) |

| Rule | Detail |
| --- | --- |
| **GUIDELINE** | Break work into manageable bits for the *current* tree. |
| **GUIDELINE** | Incremental plans implement against the existing layout. |
| **FIRM** | Major redesigns: plan first; implement only after user approval. |
| **FIRM** | Plan-linked completed work stays **with the plan**; do not pile it into `agents/tasks/completed/`. |
| **FIRM** | If a discovery should reshape the plan, stop and ask the user for direction. |
| **FIRM** | When code changes, update the plan progress note after each prompt (overwrite; one note). |

### Taskforce (plan via subagents, low token baggage)

**Purpose:** reduce token usage and raise correctness. Fresh agents + lean disk handoffs avoid carrying prior transcripts. Serial A/B work keeps context on one task.

| Rule | Detail |
| --- | --- |
| **GUIDELINE** When to use A/B | Development work that changes code or has non-trivial acceptance criteria. |
| **GUIDELINE** When to skip A/B | Docs-only, trivial rename/typo, user says “just do it”, or read-only research (dual analysis only if the plan asks). |

#### Architecture constraints (Grok Build)

| Rule | Detail |
| --- | --- |
| **FIRM** Depth limit | **Only the top-level session** may call `spawn_subagent`. Subagents **cannot** spawn children (depth = 1). |
| **FIRM** Who spawns | The **orchestrator** (parent) spawns Task Force A, waits, then spawns Task Force B, etc. Never instruct A to spawn B. |
| **FIRM** AGENTS.md inheritance | Children get a **compacted** form of **already-loaded** project instructions. If root `AGENTS.md` is gitignored or missing, children get **no** auto rules. |
| **FIRM** Prompt safety net | Every taskforce spawn prompt **must** include: (1) task path + acceptance criteria, (2) paths in scope + **git branch** (see `git.md`), (3) restatement of **FIRM** rules (commit/push feature by discretion **if origin works**; merge master only with gates; **never** auto-promote `test`/`prod`; no SSH without **explicit**; no secrets in output; design-flaw stop; **no live mutate of important data** — backup first or **dry-run** only; see `security.md` “Testing tools that touch important live data”), (4) handoff file paths to overwrite, (5) **high reasoning** unless the user told the orchestrator otherwise. |
| **GUIDELINE** Extra detail | If the task needs build/test/script standards not in the compacted core, paste the relevant bullets into the prompt or point at `agents/installed/<file>.md` to read. |

#### Core rules

| Rule | Kind | Detail |
| --- | --- | --- |
| Serial tasks | **FIRM** | One **task** at a time. Never run taskforces for **different tasks** in parallel. |
| Fresh agents | **FIRM** | New subagent(s) per task (and per A/B role/round). Do **not** `resume_from` prior taskforces to “save context” — that reloads transcript baggage. |
| One taskforce per task | **FIRM** | All A/B rounds for task T belong to T’s taskforce. Finish or escalate T before starting U. |
| Parent-only spawn | **FIRM** | Orchestrator spawns every child. Children do not spawn. |
| Correct git branch | **FIRM** | Before A implements: on the plan branch (or standalone task branch). See `git.md`. Do not implement plan work on `master`/`main` unless the user said so. |
| Handoff | **FIRM** | When a taskforce finishes a task (or stops), **overwrite** a short plan session note and task note: what shipped, key APIs/paths, next-agent bullets only. No full transcripts. |
| Orchestrator context | **FIRM** | Parent keeps plan next-task + latest handoff only. Do **not** paste prior taskforce transcripts into the next prompt. |

#### Orchestrator loop — when to keep going / stop

**Default loop (FIRM):** keep running A/B taskforces on the **next eligible task** until **either**:

1. **Orchestrator session tokens reach ~300K** (finish the **current** task’s wrap-up first, then stop starting new tasks), **or**
2. **All specified work in scope is done** (the plan’s active/required task queue, or the task list the user named in this request).

| Stop condition | Kind | Detail |
| --- | --- | --- |
| ~300K orchestrator | **FIRM** default budget | Stop **starting** new tasks at ~300K parent-session tokens. Finish current task (wrap-up + commit if success) if already mid-task. |
| Plan / request complete | **FIRM** | All **eligible** required work done → wrap last task, hand back. Do not invent more work. |
| Design-flaw | **FIRM** | Stop that task; design discussion (see below). Do not auto-jump to unrelated tasks to “use the budget.” |
| User stop / criteria met | **FIRM** | Honor extra stop criteria the user gave this session (time, “only P0”, “one task only”, etc.). |
| No eligible tasks left | **FIRM** | Stop even if under 300K. Do not pull optional/unfinalized work just to fill the budget. |
| End-of-work blockers report | **FIRM** | When the orchestrator stops (budget, plan done, hand-back, or design-flaw), **list open human blockers relevant to this session’s plans/tasks** (path, title, severity, what the human must do, what they unblock). Prefer `agents blockers` output. Lead with **hard**; soft optional. Do not bury this only inside a long transcript. |

#### Which tasks are eligible (default)

If the user does **not** specify a custom filter for this loop:

| Task kind | Eligible by default? | Detail |
| --- | --- | --- |
| Required + ready / finalized | **Yes** | Clear acceptance criteria; status is ready, next, in progress, or equivalent. |
| Named by the user this request | **Yes** | Explicitly in scope for this session. |
| **Optional** | **No** | Labeled optional, nice-to-have, stretch, backlog-optional, or “if time.” Skip unless the user asked for optional work or high-value-only **includes** it. |
| **Unfinalized** | **No** | Draft, WIP plan slice, “TBD acceptance,” blocked on design, or incomplete task doc. Skip until finalized or user forces it. |
| Blocked / open **hard** human blocker | **No** | Task `**Status:** blocked` or linked open **hard** `agents/blockers/` / `human-tasks/` item (missing severity = hard). Soft open blockers alone do **not** make unrelated tasks ineligible. Continue to next eligible task if any. |
| Minimally valuable / chore-only | **No** (default) | Unless it is on the plan’s required path or the user included it. |

**User overrides (GUIDELINE examples):** “high-value tasks only,” “P0 only,” “only tasks tagged X,” “include optional,” “finalize draft tasks first.” Apply the override for that session; otherwise use the table above.

**FIRM:** Do **not** start optional or unfinalized tasks just because budget remains under 300K.

Handoffs live in the plan/task docs so the next agent loads understanding without the previous agent’s token history.

#### Design-flaw stop (FIRM)

If A or B finds a **design flaw** (wrong architecture, acceptance that cannot be met without redesign, plan assumptions that are false) and the other role **verifies** it (or the flaw is unambiguous):

| Rule | Kind | Detail |
| --- | --- | --- |
| Stop implementation | **FIRM** | Do **not** keep coding around the flaw. No more A/B implement rounds for that task. |
| No silent redesign | **FIRM** | Do **not** invent a new design and ship it as if the plan still held. |
| Hand back | **FIRM** | Orchestrator stops the taskforce, writes a short design-issue note (symptom, evidence paths, why plan is wrong, options if obvious), and opens a **design discussion** with the user — usually as a **separate task** (or plan update) after the user decides. |
| No wrap-up commit | **FIRM** | Do **not** run the normal “wrap-up + commit” path for a design-flaw stop. Commit only WIP if the user asks to save intermediate work. |

“Design flaw” means the **approach** is wrong — not a small bug, missed call site, or test failure (those stay in the A/B loop).

#### A/B implement–verify loop (default for dev)

Independent implementer + verifier catch control-flow bugs, missed call sites, and test gaps that a single agent often ships. Verifier passes are usually cheaper than re-implementation. Rubber-stamping is a failure mode — B **must** DISAGREE when wrong.

| Role | Job | Spawn type (GUIDELINE) |
| --- | --- | --- |
| **Task Force A** | Implement against acceptance; run tests; update session/plan notes. | `general-purpose` (needs write + execute) |
| **Task Force B** | **Fresh** agent. Review diff, hunt collateral side effects, re-run tests. Does **not** re-implement from scratch. Verdict: **AGREE**, **DISAGREE** (numbered findings), or **DESIGN-FLAW** (verified design problem — stop). | `general-purpose` (needs execute to re-run tests; write only if fixing tiny bugs) |

**Loop (FIRM structure):**

```text
Orchestrator ensures plan/task git branch (git.md)
Orchestrator spawns A (Grok + high reasoning default) → A implements → returns summary
Orchestrator spawns B (fresh, Grok + high reasoning default) → B verifies
  B AGREE        → task wrap-up (docs/help/comments/tests) → commit (git.md) → next task or stop
  B DISAGREE     → orchestrator spawns fresh A with B’s findings only → B again
  B DESIGN-FLAW  → stop immediately; design discussion with user (no wrap-up commit)
  After 5 A→B rounds without AGREE → stop; report open issues to the user
```

| Rule | Kind | Detail |
| --- | --- | --- |
| Max rounds | **FIRM** | 5 full A→B cycles max; then stop and escalate to the user. |
| Fresh B each round | **FIRM** | New verifier; do not resume B across rounds. |
| Fresh A on rework | **GUIDELINE** | Prefer new A with B’s numbered findings only — not full prior A transcript. |
| B small fixes | **GUIDELINE** | B may fix one-liners / obvious typos. Non-trivial redesign goes back to A. |
| Pause for user | **FIRM** | Ambiguous product calls, destructive ops, privilege escalation, or SSH — stop and ask (SSH still requires **explicit** per `security.md`). |
| Parallel A and B | **FIRM** | Never. B must see A’s finished diff for that round. |
| Parallel explore | **MAY** | Orchestrator may spawn read-only `explore` **before** A for research on the **same** task; not a second implementer. Explore is **not** required to use high reasoning. |

#### Task wrap-up after success (FIRM default)

When a task **successfully** completes (A/B **AGREE**, or single-agent done with acceptance met) — and it is **not** a design-flaw stop:

| Step | Kind | Detail |
| --- | --- | --- |
| 1. Residue | **FIRM** | Strip debug/failed-attempt residue (see above). |
| 2. Notes | **FIRM** | Overwrite task + plan session notes; move plan-linked task to `completed/` when done. |
| 3. Docs / help | **GUIDELINE** | Update user-facing docs, README, `--help`, man-ish comments where the change warrants it. |
| 4. Code comments | **GUIDELINE** | Only where non-obvious; follow `comments.md` — no essay comments. |
| 5. Tests | **FIRM** where applicable | Add or update tests for the behavior shipped; run the relevant suite. |
| 6. Commit + push feature | **FIRM** / **GUIDELINE** | Commit on the plan/task branch (see `git.md`). **Push feature** by default if `origin` works; **skip push** if no remote. |
| 7. Merge master (dev) | **FIRM** default when gates pass | Merge feature → master when complete, master-in-feature, tested, no doubt/interference; push master if origin works. Never auto-promote **`test`** or **`prod`**. |
| 8. Skip commit | **MAY** | Skip only if the user said not to commit, nothing to commit, or secrets would be at risk. |

Orchestrator (or final A if still in-process) owns wrap-up. B’s job is verify, not own the release commit, unless the orchestrator asks B to check the wrap-up diff.

#### Models, reasoning, and local agents

| Knob | Default | Notes |
| --- | --- | --- |
| Session / orchestrator model | `grok-4.5` (typical) | Parent may stay **medium** or **low** reasoning to save tokens |
| **Task Force A/B reasoning** | **high** | **FIRM default** — independent of orchestrator effort |
| `explore` subagent | lighter OK | Research; not the implement/verify bar |
| Unset child `model` | Inherits parent model id | Still apply **high** reasoning for A/B when the tool/config allows |

| Rule | Kind | Detail |
| --- | --- | --- |
| Task force = Grok high | **FIRM** | Spawn Task Force A and B with **Grok** (cloud default `grok-4.5` unless the user named another Grok id) and **high reasoning effort**, even when the orchestrator session is medium or low. |
| Override only from user | **FIRM** | Lower A/B reasoning or switch A/B off Grok **only** if the **user** told the orchestrator (this request) to do so (e.g. “use medium for taskforces”, “use local for A”). |
| How to apply high | **GUIDELINE** | Prefer spawn/role/persona/config knobs that set reasoning effort to high. If the spawn API only inherits session effort, say in the child prompt: “Use maximum reasoning depth; do not skim.” Do not silently drop to medium to save tokens. |
| Explore may be cheap | **MAY** | `explore` may use `grok-build` / local / medium. |
| Local models for A/B | **MAY** | Only when the user authorized local taskforces. Prefer Grok high for final implement + verify. |
| Orchestrator quality | **GUIDELINE** | Medium orchestrator is fine when the plan and acceptance are detailed. Orchestrator does **not** force A/B down to medium. |
| Do not thrash models | **FIRM** | Do **not** switch model or reasoning every A/B round hoping for a different answer. Keep the authorized model/effort; fix the prompt, acceptance criteria, branch, or escalate. “Thrashing” = burning tokens on model roulette instead of fixing the task setup. |

#### Capability modes (safety + efficiency)

| Rule | Kind | Detail |
| --- | --- | --- |
| Least privilege | **GUIDELINE** | Prefer the narrowest `capability_mode` that still completes the role. |
| Explore / research | **GUIDELINE** | `explore` type or `capability_mode=read-only` / `execute` without write when no edits are needed. |
| Implementer A | **GUIDELINE** | Full tools (`general-purpose` / `all`). |
| Verifier B | **GUIDELINE** | Needs execute to re-run tests; avoid broad unrelated edits. |

#### What “good” looks like (professional bar)

| Outcome | Pass criteria |
| --- | --- |
| Correctness | Acceptance criteria met; tests run (or explicit reason they could not). |
| Independence | B’s review is not a paraphrase of A’s summary; findings cite paths/symbols. |
| Design honesty | DESIGN-FLAW stops instead of papering over plan mistakes. |
| Branch hygiene | Work landed on the plan/task branch; wrap-up commit is local only unless push requested. |
| Safety | No SSH/push/secrets violations; destructive steps asked first. |
| Human queue | Open blockers filed under `agents/blockers/` (or listed via `human-tasks/`); end report lists them. |
| Token discipline | Handoffs short; no transcript pasting; no model thrashing; stop at budget / done / low value. |
| Residue | No debug leftovers; task + plan notes overwritten cleanly. |

#### “Begin” / unattended orchestrator start (GUIDELINE)

When the user says **Begin** (or equivalent) without naming a task:

1. Read `agents/PRIORITY.md` (if present) and run `agents blockers` / list open blockers.
2. Pick the highest-priority **eligible** agent task (not optional, not draft, not blocked).
3. Ensure plan/task branch; run A/B taskforces per rules until ~300K or no eligible work left.
4. End with wrap-up + **open blockers report** for anything the human still owns.
