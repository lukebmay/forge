# Plan: CLI attachable jobs (survive TTY death)

**Status:** **complete** (CJ1–CJ6) — durable mutators + jobs CLI + live smoke + docs  
**Priority:** was **P0**; shipped 2026-08-09  
**Branch:** `master`  
**Related:** [forge-command](./forge-command.md); [AI live matrix](./forge-ai-live-test-matrix.md);
[HANDOFF](../HANDOFF.md); [project.md](../project.md)

---

## Goal

Long-running / desk-mutating `forge` commands run as **durable one-shot jobs**.
Default UX still looks like a normal foreground CLI (TTY waits and streams
output). **If the terminal dies, the job continues.** No flag required for that.

Closing the agent window mid-`forge layout` must stop being a common path to a
half-applied desk.

---

## Product rules (locked)

1. **Durability is default** for in-scope commands. Surviving TTY death does
   **not** require a flag.
2. **Default = start job + attach** (wait, stream stdout/stderr, exit with
   worker status). Looks like today’s foreground CLI.
3. **`--detach`** only means: start job, print job id, return immediately.
   Same durable worker; no wait.
4. **Not every subcommand** uses the job runner. Fast/read-only commands stay
   in-process (`ping`, `tree`, `help`, `layout list|show|help`, …).
5. **One mutating job at a time** (single-flight). A second mutator either
   refuses with a clear error pointing at the running job, or attaches to it
   if the same logical command — prefer **refuse + show job id** for v1.
6. **Jobs, not a long-lived daemon.** One-shot worker process per command;
   status/logs on disk; exit when done.
7. **Ctrl+C while attached** forwards cooperative cancel to the worker.
   After detach/TTY death: `forge jobs cancel <id>`.
8. **Job deadline + reaper** — phase timeouts stay; add whole-job ceiling;
   reaper on `forge` entry / `forge jobs` for dead PIDs and stale jobs.
9. **Idempotent re-apply remains the heal path** if a worker dies hard
   (`kill -9`, OOM). Detach raises completion rate; it does not make
   intermediate DBus steps atomic.
10. **Session-bound, not reboot-bound.** Worker inherits user session DBus /
    display env. Logout/reboot ends jobs (correct).

---

## UX sketch

```bash
# Default: durable + attach (critical path)
forge layout mydesk
# …streams… then exits with worker code

# Explicit fire-and-forget
forge layout mydesk --detach
# → job <id> started

forge jobs                 # list
forge jobs attach <id>     # re-attach streams + signals
forge jobs cancel <id>     # cooperative stop
forge jobs log <id>        # tail/show log
forge jobs status <id>     # machine-readable status

# Escape hatches
forge layout mydesk --foreground   # old in-process path (debug)
FORGE_JOB=0 forge layout mydesk    # same
FORGE_JOB_TIMEOUT=180 forge …      # override ceiling (seconds)
```

### Signal policy

| Event | Attached parent | Worker |
| --- | --- | --- |
| Normal exit | Propagate worker exit code | Exit |
| Ctrl+C / SIGINT | Forward cancel to worker | Cooperative stop → non-zero |
| SIGHUP / TTY death | Parent exits (optional notice to log) | **Ignore HUP; continue** |
| `jobs cancel` / deadline | — | Cooperative stop → `timeout`/`cancelled` status |

Worker: `setsid` (or equivalent new session / process group), no dependence on
controlling TTY for survival. Log file is source of truth after detach.

---

## In-scope commands (v1)

| Command | Job? | Notes |
| --- | --- | --- |
| `forge layout <name>` (apply) | **Yes** | Primary motivation |
| `forge layout clean` | **Yes** | Mutating |
| `forge run` / `run-steps` | **Yes** | Multi-step |
| `forge launch` (with wait) | Yes if multi-second | Optional v1 if cheap |
| `forge install` / `update` / `uninstall` | **Yes** | Long; no DBus required for some |
| `forge test live run` | **Yes** | Long campaigns |
| `forge ping` / `tree` / `help` / `layout list\|show` | **No** | Fast / read-only |
| `forge focus` / single Get/Set | **No** (v1) | Short atomic |

Expand the “yes” set if a command grows multi-second waits.

---

## Implementation sketch

| Piece | Role |
| --- | --- |
| `scripts/forge/job_runner.py` (name TBD) | Spawn worker, attach I/O, signal relay, status files |
| Job dir | `~/.local/share/forge/jobs/<id>/` — `pid`, `status.json`, `stdout.log`, `argv.json`, `started_at` |
| `forge` entry | Before mutating path: ensure no conflicting job; spawn+attach or `--detach` |
| `forge jobs *` | List / attach / cancel / log / status; reaper |
| Worker entry | Same code path as today, under job context (env `FORGE_JOB_ID`, log redirect) |
| Deadlines | Default ceiling per command class (layout ~3–5 min; install higher; live-test case/campaign ceilings) |
| Units | Pure tests for status machine, reaper, signal policy mocks; no live TTY required for core |

Prefer portable Python (`os.setsid`, pipe/PTY, pid files) over requiring
`systemd-run`. Optional later: detect systemd user and use transient scopes for
cgroup kill / `RuntimeMaxSec`.

### Concurrency

v1: **global single-flight** for mutating jobs (one lock file under job root).
Read-only commands never take the lock.

---

## Testing impact (important)

Today many live/agent rules exist because **killing the agent TTY kills apply**:

- “Never close agent Ghostty”
- Guake preferred for true cold so agent is not a tile that dies with the suite
- Capability gates around where the agent runs

### After this lands

| Before | After |
| --- | --- |
| Closing agent terminal mid-layout → bad desk | Layout job finishes; desk reaches terminal state or clean fail |
| Suites encode “don’t kill agent host window” for apply survival | **Drop** apply-survival constraints that only existed for TTY coupling |
| Fear of agent in Ghostty for long applies | Agent window placement is about **desk topology / true cold**, not job survival |

### What still needs agent-placement knowledge

- **True cold** still closes TILE windows. If the agent is a tiled Ghostty, the
  *window* goes away even if a detached job continues. Agent **process**
  survival ≠ agent **window** on the desk.
- Judgment-heavy live cases still need *some* way to talk to the agent
  (reattach, logs, or a non-tile agent host).
- So: **fewer** “don’t close the terminal or apply dies” tests; **not zero**
  “where does the agent UI live for cold suites.”

### New tests to add

1. **Unit:** job status machine, single-flight lock, reaper, timeout → status.
2. **Unit/integration:** attach parent dies (simulated HUP) → worker still
   completes (mock work).
3. **Live smoke (one case):** start `forge layout …`, kill attach parent only,
   assert job status becomes `ok`/`failed` and desk is not “half silent death.”
4. **Cancel smoke:** attached Ctrl+C / `jobs cancel` → cooperative stop.
5. **Retire/rewrite** docs and live notes that only exist for TTY-kills-apply.

Do **not** keep parallel “close terminal carefully” harnesses once the job
runner is proven — delete residue.

---

## Documentation (ship gate — do not skip)

When this plan is **complete**, update all of:

| Doc | Audience | What to add |
| --- | --- | --- |
| [agents/project.md](../project.md) | Agents | Job model, default attach, single-flight, job dir, which commands, signal policy, test implications |
| [README.md](../../README.md) | Users | Feature blurb; how default vs `--detach` works; `forge jobs`; **architecture choice in plain language**; **warn about long first layout apply** and why (settle learning / cold open / waiting for apps — “first run can take many seconds so the desk ends correct; later runs are faster”) |
| [docs/DECISIONS.md](../../docs/DECISIONS.md) | Why | New D0xx: attachable jobs default; no flag for durability |
| [docs/DESIGN.md](../../docs/DESIGN.md) | Why narrative | Short “CLI job runner” section |
| [docs/user/](../../docs/user/) + [scripts/forge/README.md](../../scripts/forge/README.md) | Operators | `jobs` subcommands, timeouts, troubleshooting hung jobs |
| [agents/HANDOFF.md](../HANDOFF.md) / [PRIORITY.md](../PRIORITY.md) | Agents | Drop stale “never close Ghostty or apply dies” if no longer true; keep true-cold placement notes |
| [agents/installed/testing.md](../installed/testing.md) if needed | Agents | Live matrix: fewer TTY-survival suites; job runner tests |

### README plain-language note (draft for ship)

> **Long first layout apply:** The first time Forge applies a full desk layout
> (especially after login or with apps closed), it may take a while. That is
> intentional: Forge waits for windows to really appear and settle, and learns
> how long your apps need, so it does not yank them around early or leave you
> with a half-built desk. Later applies are usually much faster. Closing the
> terminal during apply no longer aborts the job — work continues in the
> background and you can check `forge jobs`.

---

## Related: durable Grok / agent host (shellrc — promoted)

**Tracked in shellrc as P0** (native leader spike first):  
[`~/dev/me/shellrc/agents/plans/grok-reattachable-headless.md`](../../../../shellrc/agents/plans/grok-reattachable-headless.md) ·  
[GH0](../../../../shellrc/agents/tasks/grok-reattachable-headless_gh0-leader-spike.md)

| Layer | Problem | Owner |
| --- | --- | --- |
| **Forge CLI jobs** (this plan) | Mutating desk work dies with TTY | **This repo — P0** |
| **Grok reattachable headless** | Agent process/conversation dies with TTY | **shellrc — P0** (separate task) |

Do **not** block CLI jobs on the Grok wrapper. Both are high value; they compose:

1. **Forge jobs alone:** Layout finishes if the agent TTY vanishes; agent may die.  
2. **Grok wrapper alone:** Agent lives; non-job foreground `forge` can still die.  
3. **Both:** Agent + desk work survive TTY loss; fewer “where is Grok” live constraints.

True cold still cares about **windows** (no agent TILE). Headless Grok helps
when the agent is not a TILE client.

---

## Tasks

| ID | Task | Status |
| --- | --- | --- |
| **CJ0** | Design lock + decision row + plan (this file) | **done** (this session) |
| **CJ1** | Job runner core: spawn, status dir, attach I/O, HUP-safe worker, single-flight | **done** → [completed](./forge-cli-jobs/completed/forge-cli-jobs_cj1-runner-core.md) |
| **CJ2** | Wire mutating CLI paths (`layout` apply/clean, `run`, install family, live run) + `--detach` / `--foreground` | **done** → [completed](./forge-cli-jobs/completed/forge-cli-jobs_cj2-wire-mutators.md) |
| **CJ3** | `forge jobs` list/attach/cancel/log/status + reaper + deadlines | **done** → [completed](./forge-cli-jobs/completed/forge-cli-jobs_cj3-jobs-cli.md) |
| **CJ4** | Unit tests (status, reaper, parent-death simulation, single-flight) | **done** in `test_job_runner.py` (31) |
| **CJ5** | Live smoke: kill attach parent mid-layout; cancel path; retire TTY-only harness notes | **done** → [completed](./forge-cli-jobs/completed/forge-cli-jobs_cj5-live-smoke.md) |
| **CJ6** | Docs ship gate: project.md, README (arch + first-load warning), DECISIONS, DESIGN, user/scripts README, HANDOFF/testing | **done** |

Task files: `agents/tasks/forge-cli-jobs_cjN-….md` as work starts; completed →
`agents/plans/forge-cli-jobs/completed/`.

---

## Acceptance (plan done when)

- [x] In-scope commands are durable by default (no flag); attach is default UX
- [x] `--detach` returns immediately with job id; same worker
- [x] TTY/SIGHUP death does not kill worker; job reaches terminal status on disk
- [x] Ctrl+C attached cancels cooperatively; `forge jobs cancel` works detached
- [x] Single-flight mutators; clear error if busy
- [x] Job deadline + reaper; no infinite hung workers as steady state
- [x] Units green; one live parent-kill smoke green on X11
- [x] Live/agent docs no longer claim “closing terminal aborts layout”
- [x] **All documentation ship-gate rows updated** (especially project.md + README
      architecture + long first-load warning in human terms)
- [x] Grok wrapper explicitly out of scope here (optional follow-on noted)

---

## Non-goals (v1)

- Always-on forge daemon / queue of many applies
- systemd required
- Making intermediate RunSteps transactional/rollback
- Wrapping Grok or other agents inside this repo
- Changing layout settle semantics (only *who hosts* the apply process)
