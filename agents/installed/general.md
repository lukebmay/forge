---
title: General process
read_when: Always for multi-step work — tasks, plans, blockers, handoffs, taskforces, orchestrator, subagents, architecture vs patches
order: 10
---

# General Agent Guidelines

## Rule vocabulary

| Label | Meaning |
| --- | --- |
| **FIRM** | Must follow. Escalate or stop if you cannot. |
| **GUIDELINE** | Default; override only with clear reason. |
| **MAY** | Optional. |

Unlabeled: treat security, git push/secrets, and SSH as **FIRM**; process/style as **GUIDELINE**.

## Clarity (FIRM)

Aim for ~**90%** confidence the next agent/human acts correctly. Do not shave tokens into ambiguity.

Agent↔agent text (handoffs, spawn notes, PRIORITY, session notes): **functionally detailed, unambiguous, succinct** — not “short” or “long.” No transcript dumps. Redundancy only for rare strong emphasis.

`AGENTS.md` is a **routing index** (when to open files under `agents/`). Full rules live in those files. Open them when triggers match.

## Residue (FIRM)

Before finishing: remove temp paths, debug prints, failed-attempt code, fake fixtures, and live-env residue you added. Failed attempts: delete dead code everywhere it landed.

## Backwards compatibility (GUIDELINE)

During active development, do **not** preserve backwards compatibility by default. Prefer clean breaks unless real users depend on a released surface.

## Architecture over patches (FIRM)

Prefer a strong architectural fix when the failure class will recur or band-aids are stacking. Temporary only if the operator **explicitly** asks for temp/stopgap.

If a warranted redesign looks **very expensive** (millions+ tokens, multi-session rewrite) vs a small patch: **stop**, present options, open a **hard** design blocker. Do not silently burn a huge redesign.

When the real fix lands, remove competing crutches in the same effort when safe.

## Optional features in dev (FIRM)

When working on an optional feature, **enable it** in the local/dev environment for that session. Record how in the task/handoff. Dev-on ≠ ship default-on.

## Tasks

| Rule | Detail |
| --- | --- |
| Active path | `agents/tasks/<name>.md` (kebab-case) |
| Plan-linked name | `{plan}_{task}.md` |
| Done (plan-linked) | → `agents/plans/<plan>/completed/` |
| Done (standalone) | → `agents/tasks/completed/` |
| Status | `ready` / `next` / `in progress` / `blocked` / `optional` / `draft` |
| Optional | Skip unless user includes optional |
| Blocked | Requires linked **hard** human blocker |
| Draft | Not a stop if next required slice has enough plan scope — write task + implement |
| Progress | One overwrite session note per prompt when code changes |

### Task template

```markdown
# plan-id_task-slug — Title

**Status:** ready
**Plan:** plan-id | (none)
**Branch:** master (default) | plan/… only if isolated
**Blocker:** (none) | agents/blockers/B-….md
**Updated:** YYYY-MM-DD

## Goal
## Acceptance
- [ ] …

## Context for the next agent (complete + succinct)
- Paths/symbols · Proven · Failed+why · Enable/test · Risks

## Session note
…
```

### Archive

`agents/archive/INDEX.md` + `entries/` for searchable ship summaries. Do not delete completed task/plan files when archiving.

## Human blockers

**Real** human work only — not agent laziness.

| Severity | Behavior |
| --- | --- |
| **hard** (default if omitted) | Required path stopped; task `blocked`; taskforces skip |
| **soft** | Optional reminder; does not stop unrelated work |

| Rule | Kind |
| --- | --- |
| Hard only when agent must not proceed alone | **FIRM** |
| Make human work easy (exact checklist/commands) | **FIRM** |
| Prep first (install/config/branch if you can) | **FIRM** |
| Never mark human steps done yourself | **FIRM** |
| Fake blockers forbidden | **FIRM** |

Kinds: design · permission · credentials · physical · expensive-test · verify · data-only-human.

```markdown
# B-short-id — Title
**Status:** open
**Severity:** hard | soft
**Owner:** human
**Kind:** design | …
**Plan:** …
**Unblocks:** agents/tasks/…
**Priority:** P0
**Created:** YYYY-MM-DD
**Updated:** YYYY-MM-DD

## Why this is human-only
## Agent prep already done
## What the human must do
## Done when
```

## Handoffs (FIRM)

| Path | Role |
| --- | --- |
| `agents/HANDOFF.md` | Cross-session start-here |
| Plan/task session notes | Cold-continue for that unit |
| `agents/PRIORITY.md` | Ordered next work |

Functionally complete + unambiguous + succinct. Overwrite, don’t pile. Exploration findings that prevent rescans belong on disk.

## Plans

`agents/plans/<plan>.md`; completed tasks under `agents/plans/<plan>/completed/`.

| Rule | Detail |
| --- | --- |
| Major redesigns | Plan first; implement after approval |
| Plan reshape discovery | Stop and ask |
| Progress note | Overwrite one note when code changes |

### Orchestrator + taskforces (when plans / priorities)

On plan or priority work, the **main agent is the orchestrator**: assign work to
subagents; do not do large implementation yourself when a taskforce fits.

| Rule | Detail |
| --- | --- |
| Who spawns | **Only** top-level orchestrator; children cannot spawn |
| Default shape | **Single-agent** taskforce (one implementer per assignment) |
| Batching | **MAY** give one agent several related tasks when one session is likely cheaper than multiple handoffs |
| Parallel | **Only when safe** (no shared-file races, no conflicting branch edits, independent acceptance). Otherwise **serial** |
| A/B (expensive) | **Only when necessary** — major design/architecture, high-stakes decisions, or when a separate verifier is clearly worth the cost. Not the default for ordinary implement slices |
| A then B | When A/B is used: implement → verify; **never** parallel A/B |
| Explore (on demand) | **MAY** use a short-lived read-only explorer for cold/unfamiliar scope. Prefer **explore+implement in one agent** for ordinary slices |
| Explore output | Write findings only into the **active** task/plan handoff (entry points, proven vs guessed, traps). **No** standing repo-wide explore digest |
| Fresh agents | New subagent(s) per assignment; no `resume_from` for baggage (unless operator asks) |
| Branch | **Default master** unless isolation required (see git.md) |
| Handoff | Overwrite disk notes (complete+succinct); no transcript paste into next prompt |
| Budget | Stop starting new tasks ~300K orchestrator tokens |
| Max A/B rounds | 5 A→B when A/B is in use; then escalate |
| DESIGN-FLAW | Stop; design discussion; no wrap-up commit |
| Model | Grok + high reasoning unless user says otherwise |
| Eligible | Required ready/next/in-progress; not optional/hard-blocked |

**Cost stance (GUIDELINE):** A/B doubles agent work. Prefer one capable implementer +
orchestrator review of disk notes/diff. Escalate to A/B for big irreversible
choices or when independent verification is the acceptance path.

**Explore stance (GUIDELINE):** Explorer *passes* yes; explorer *literature* no.
Skip a separate explore step when the plan/task already scopes paths, the area is
recently known, or the implementer will re-walk the same tree anyway. Summaries
earn tokens only when they block a re-scan for **this** work — overwrite or drop
them with the task.

**Begin** (no task named): read PRIORITY + blockers → next eligible required work
→ single-agent (or rare A/B) taskforces until budget/done → report open blockers.

Wrap-up on success: residue → notes → docs as needed → tests → commit/push per git.md.

## AGENTS.md setup (FIRM)

Do not gitignore root `AGENTS.md`. After fragment changes: `agents build`. Index only — full rules stay under `agents/installed/` and user overrides.
