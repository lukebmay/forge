# forge-nested-cli-separation — Nest out of user CLI, into testing tools

**Status:** ready (P0 plan lock next)  
**Priority:** product hygiene — user CLI surface  
**Branch:** `master`  
**Related:** [forge-nested-isolation](./forge-nested-isolation.md) (D022 nest behavior stays);
[forge-ai-live-test-matrix](./forge-ai-live-test-matrix.md); [forge-cli-node](./forge-cli-node.md)
CN14 (nest/live later); [testing.md](../testing.md); [project.md](../project.md)

---

## Goal

**Nested Wayland is a developer / agent retest harness, not a daily-driver product
command.** End users of the Forge CLI should not see, depend on, or get Nested as
part of the everyday user bundle.

| Audience | Nested? |
| --- | --- |
| Daily-driver user (`forge layout`, `forge tree`, install, …) | **No** — not in help, not part of the user-facing ship surface |
| Developer / agent / CI retest tooling | **Yes** — ship with testing tools |

Behavior of the nest harness itself (D022 isolation, mon=1 default, `run` always
stops, private bus) is **not** reopened by this plan. This plan is **packaging +
CLI surface + docs**, not a nest redesign.

---

## Why

1. **Forge CLI is primarily for the user** — tiling control, layouts, settings,
   install/update — not a general developer toolkit.
2. Nested GNOME Shell is a **retest loop** (avoid Wayland logout). It belongs with
   `forge test live`, Makefile nest targets, CONTRIBUTING, and agent testing docs.
3. Shipping Nested on the top-level user surface teaches the wrong product shape
   and bloats “what is forge” for people who never retest extension JS.

---

## Current state (inventory seed for P0)

| Piece | Path / surface | Role today |
| --- | --- | --- |
| Nest harness | `scripts/forge/nested_wayland.py` (~1.7k lines) | Full lifecycle |
| Top-level CLI | `forge nested …` in `scripts/forge/forge` | User-visible subcommand |
| Help | `cli_help.py` lists `nested` next to product cmds | User-facing |
| Live matrix | `live_matrix.py` + `forge test live` | Probe/plan/run; imports nest |
| Units | `tests/unit/cli/test_nested_wayland.py` | Harness tests |
| Make | `nested-start/stop/restart/status`, `test-nested` | Dev shortcuts |
| User docs | `docs/user/troubleshooting.md` | Mentions `forge nested restart` |
| Dev docs | CONTRIBUTING, `agents/testing.md`, HANDOFF, PRIORITY | Primary consumers |
| Install | `./install` → `~/.local/bin/forge` → full CLI | Nested rides along |

P0 must expand this inventory (grep call sites, install stamps, migrate messages,
agent rules) before locking the ship shape.

---

## Non-goals

- Changing nest isolation, mon policy, or D022 process rules.
- Porting Nested to Node (CN14) — optional later; separation must not require it.
- Removing Nested from the **repo** or from agent workflows.
- Reworking the entire `forge test live` matrix (only relocate Nested’s home).
- UNIX test user / bubblewrap (still rejected for nest v1).

---

## Design questions (P0 must lock)

1. **Entry point after separation**
   - Preferred candidates to evaluate (pick one primary + optional thin aliases):
     - `forge test nested …` (fold under existing test tree)
     - Standalone `forge-nested` / `scripts/forge/forge-nested` on dev PATH only
     - Repo-only: Makefile + `python3 -m` / script path; no top-level product verb
   - Agents and CONTRIBUTING must keep a **stable, typed** command string after P1.

2. **What “ships with testing tools” means**
   - Same git tree, gated surface (help + install message)?
   - Separate install kit / flag (`./install --dev` / `make dev-tools`)?
   - Always present under `scripts/` for clone-based developers, absent from
     minimal user install if such a path exists later?
   - Hard requirement: **everyday user `forge help` and user docs do not present Nested.**

3. **Compat for `forge nested`**
   - Hard break (unknown command) vs hidden shim vs deprecation period.
   - Default stance in this product: **clean break is OK** during active
     development unless real users depend on the surface (GUIDELINE in general.md).
     P0 still records the choice and any one-line migration note.

4. **Coupling to `forge test`**
   - Nested is test infrastructure; `forge test live` already lives on the CLI.
   - P0 decides whether this slice only moves Nested, or also marks **all**
     `forge test *` as non-user tooling (docs/help grouping). Prefer **Nested-first**
     scope unless the same help pass is trivial.

5. **Agent / Makefile / live matrix update scope**
   - Every FIRM string (`forge nested run`, `nested restart`, doctor) must move
     in the same implement slice so agents do not teach the dead verb.

---

## Implement slices (after P0)

| Id | Task | Goal |
| --- | --- | --- |
| **P0** | Plan lock | Inventory complete; entry point + ship rule + compat locked; acceptance written |
| **P1** | Separate surface | Nested not on user CLI help/top-level product parser; available via testing tools entry |
| **P2** | Docs + agent rules | User docs drop Nested; CONTRIBUTING/testing/HANDOFF/PRIORITY/Makefile/live matrix use new entry |
| **P3** | Tests + smoke | Units/help asserts; developer path still start→run→status False; no residual nest |

P1–P3 may merge into one implement task if the diff stays coherent. P0 is a hard
gate: **do not implement until entry point and ship rule are locked on disk.**

---

## Acceptance (plan-level)

- [ ] P0: design locked in this plan (or D0 task note) — entry point, ship rule, compat
- [ ] User-facing `forge help` / top-level command list has **no** Nested
- [ ] Nested remains usable for developers/agents via the locked testing-tools entry
- [ ] User docs do not instruct Nested as a daily-driver step
- [ ] Agent FIRM commands, Makefile, live matrix probe text match the new entry
- [ ] Units cover help surface + nest entry; live/dev smoke path documented
- [ ] Everyday install path does not present Nested as product (per ship rule)

---

## Code map (expected touch list — refine in P0)

| Area | Likely paths |
| --- | --- |
| CLI router / help | `scripts/forge/forge`, `cli_help.py` |
| Nest module | `scripts/forge/nested_wayland.py` (entry rename/messages; logic stays) |
| Live / test | `live_matrix.py`, `cmd_test` wiring |
| Install / messages | `install.zsh`, `_lib.zsh`, `migrate-from-ego.zsh` if they advertise nest |
| Make | `Makefile` nest targets |
| Units | `tests/unit/cli/test_nested_wayland.py`, help tests if any |
| User docs | `docs/user/troubleshooting.md` (and any other user mentions) |
| Dev / agent docs | CONTRIBUTING, `agents/testing.md`, HANDOFF, PRIORITY, project |

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Agents keep typing `forge nested` | Update FIRM strings + help in same slice; optional short-lived shim only if P0 requires |
| Live matrix breaks import/entry | Keep `nested_wayland` module path stable; only CLI surface moves |
| User still needs “reload on Wayland” | User docs: logout/in for host tip; Nested stays **dev-only** |
| Scope creep into Node port | Explicit non-goal; stay on Python harness |

---

## Tasks

| Task | Status | Path |
| --- | --- | --- |
| P0 plan lock | **ready** | [tasks/forge-nested-cli-separation_p0-plan.md](../tasks/forge-nested-cli-separation_p0-plan.md) |
| P1+ implement separate | **next** (after P0) | [tasks/forge-nested-cli-separation_p1-separate.md](../tasks/forge-nested-cli-separation_p1-separate.md) |

---

## Session note

**2026-08-17:** Operator asked to remove Nested from what ships in the user-facing
Forge CLI and ship it with testing tools. Plan + P0/P1 tasks created; no code
change yet. Nest behavior (D022) unchanged.
