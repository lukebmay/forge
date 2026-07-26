# General Agent Guidelines

Follow `agents/` as needed. Do **not** load every file up front — the project composer (`agents.py` / `agents build`) assembles the stable core into root `AGENTS.md`. Examples of portable fragments: `security.md`, `git.md`, `scripting.md`, `comments.md`, `documentation.md`, `ansi-colors.md`, `markdown.md`. Interesting design decisions live in `docs/DESIGN.md` (see `documentation.md`).

## Installed vs user overrides (precedence)

Portable guidelines are **managed** under `agents/installed/` (installed/updated by the shellrc `agents` CLI). **Do not edit** files under `agents/installed/`.

| Path | Role |
| --- | --- |
| `agents/installed/<path>.md` | Catalog copy — managed; restore with `agents update` |
| `agents/<path>.md` | **User override** — same relative path; project-local edits live here |
| `agents/project.md` | Project-only notes (always user) |
| `agents/plans/`, `agents/tasks/` | Session work (always user) |

**When both an installed file and a user override exist for the same relative path** (e.g. `agents/installed/general.md` and `agents/general.md`):

1. Read the **installed** copy first (baseline catalog rules).
2. Read the **user** copy **last**.
3. **User wins** on any conflict — treat the override as project-specific precedence over the installed fragment.

Compose order in `AGENTS.md` follows the same rule (user override sections are labeled `… (user)` and appear after the managed copy). Customize with `agents edit general` (opens `agents/general.md`, never `agents/installed/`). Accidental edits of `installed/` are reclaimed into user overrides by `agents update` / `agents reclaim`.

**Language / stack style:** when relevant, read `agents/languages/<name>.md` and any matching user override under `agents/languages/`. **Project** style/formatter/LSP configs always win over those defaults.

## No leftover residue

Before finishing, remove temporary and failed-attempt residue from code, configs, and the live environment:

- Paths/imports to `/tmp/...`, scratch clones, ephemeral dirs
- Dummy data, fake commits, debug prints, test-only flags in real paths
- Installer/dotfile targets rewritten to temp or non-real paths
- Temp files, stamps, or fixtures left unrestored
- **Debug / diagnostic / exploration code** added while solving — strip it once the real fix lands, unless the product intentionally needs it or the task **explicitly** asks for lasting diagnostics
- **Failed attempts:** when a later fix supersedes earlier tries, remove dead code from *every* place those attempts touched, not only the final file

Search the diff and smoke-check real paths you touched.

## Tasks

Session-sized work lives in `agents/tasks/`. Prefer one completable session. Tasks often implement one slice of a plan.

| Rule | Detail |
| --- | --- |
| Active | Always `agents/tasks/<name>.md` while in progress or ready |
| Naming | kebab-case |
| Plan-linked | `{plan}_{task}.md` (e.g. plan `shellrc-startup.md` → task `shellrc-startup_c1-c3.md`) |
| Standalone | No plan prefix required (e.g. `scripts-agentsmd.md`) |
| Done (plan-linked) | Move to `agents/plans/<plan>/completed/` — **not** `agents/tasks/completed/` |
| Done (standalone) | Move to `agents/tasks/completed/` only when the task has **no** plan |

Examples:

| Kind | Active path | Completed path |
| --- | --- | --- |
| Plan-linked | `agents/tasks/displays-live-set_c-multigroup-aliases.md` | `agents/plans/displays-live-set/completed/displays-live-set_b-set-modes.md` |
| Plan-linked | `agents/tasks/shellrc-startup_….md` | `agents/plans/shellrc-startup/completed/shellrc-startup_b1.md` |
| Standalone | `agents/tasks/scripts-agentsmd.md` | `agents/tasks/completed/scripts-agentsmd.md` |

When finishing a plan-linked task: update acceptance + session note, move the file under that plan’s `completed/`, point the plan’s “next task” at the following slice, and fix any stale path refs.

When code changes, ALWAYS update the task with a brief note/summary on progress after each prompt. One update per session. Overwrite and re-summarize the note after each prompt instead of piling up notes.

### Archive (searchable summaries)

Finished work also gets a **high-level** entry under `agents/archive/`:

| Path | Role |
| --- | --- |
| `agents/archive/INDEX.md` | One-line table (tags, dates, links) — **search here first** |
| `agents/archive/entries/<slug>.md` | Design choices, why, major problems |
| `agents/PRIORITY.md` | Active ordered queue (not archive) |

Do not delete completed task/plan files when archiving; archive is the summary layer.
Cross-repo priorities: `~/dev/me/life/agents/PRIORITY-BOARD.md`.

## Plans

Plans live in `agents/plans/` as kebab-case **files** (`agents/plans/<plan>.md`). Read only when the current task needs them.

| Layout | Path |
| --- | --- |
| Plan doc | `agents/plans/<plan>.md` |
| Completed tasks for that plan | `agents/plans/<plan>/completed/*.md` |
| Active tasks for that plan | `agents/tasks/<plan>_….md` (still under tasks/) |

- Break work into manageable bits for the *current* tree
- Incremental plans implement against the existing layout
- Major redesigns: plan first; implement (e.g. under `src/`) only after approval
- Plan-linked completed work stays **with the plan**; do not pile it into `agents/tasks/completed/`

Update the plan as you execute (status, discoveries, task table paths). If a discovery should reshape the plan, stop and ask the user for direction.

When code changes, ALWAYS update the plan with a brief note/summary on progress after each prompt. One update per session. Overwrite and re-summarize the note after each prompt instead of piling up notes.

### Taskforce (plan via subagents, low token baggage)

**Default for development work** that changes code or has non-trivial acceptance
criteria: use the **A/B implement–verify loop** below. Skip for pure docs,
one-line fixes, or when the user asks for a single agent.

#### Core rules

| Rule | Detail |
| --- | --- |
| **Serial** | One task at a time. Never run taskforces for different tasks in parallel. |
| **Fresh agents** | New subagent(s) per task; do **not** resume prior taskforces (avoids transcript baggage). |
| **Scope** | Spin as many agents as that task would normally need — still one taskforce per task. |
| **Handoff** | Each taskforce finishes the task, then **overwrites** a short plan session note (and task note): what shipped, key APIs/paths, next-agent bullets only. |
| **Orchestrator** | Parent keeps only plan next-task + handoff; do not paste prior taskforce transcripts into the next prompt. |
| **Stop early** | After a task, if the next would exceed a lean context budget, **stop** and hand back to manual sessions. |

Handoffs live in the plan/task docs so the next agent loads understanding without the previous agent’s token history.

#### A/B implement–verify loop (default for dev)

Worth the tokens when correctness and collateral matter: implementer and
independent verifier catch control-flow bugs, missed call sites, and test gaps
that a single agent often ships. Verifier passes are usually cheaper than
implementation. Rubber-stamping is a failure mode — B must disagree when wrong.

| Role | Job |
| --- | --- |
| **Task Force A** | Implement the task against acceptance; tests; session/plan notes. |
| **Task Force B** | **Fresh** agent. Review diff, hunt collateral side effects, re-run tests. Does **not** re-implement from scratch. Verdict: **AGREE** or **DISAGREE** with numbered findings. |

**Loop:**

```text
A implements → B verifies
  B AGREE  → done (orchestrator wraps: notes, priority, commit if asked)
  B DISAGREE → A fixes only listed findings (fresh A preferred) → B again
  After 5 A/B rounds without AGREE → stop; report open issues to the user
```

| Rule | Detail |
| --- | --- |
| **Max rounds** | 5 full A→B cycles; then stop and escalate. |
| **Fresh B each round** | New verifier; do not resume B’s transcript across rounds. |
| **Fresh A on rework** | Prefer new A with B’s FAIL list only — not full prior A transcript. |
| **B may fix small clear bugs** | One-liners / obvious brace mistakes OK; non-trivial redesign goes back to A. |
| **Pause for user** | Ambiguous product calls, destructive ops, or SSH — ask before finishing. |
| **Skip A/B when** | Docs-only, trivial rename/typo, user says “just do it”, or read-only research (use dual analysis taskforces only if the plan asks). |
