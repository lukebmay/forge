# forge-nested-cli-separation — Nest out of user CLI, into testing tools

**Status:** **done** 2026-08-17 (P0 lock + P1 separate)  
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

## Inventory (P0 complete)

| Piece | Path / surface | Role today |
| --- | --- | --- |
| Nest harness | `scripts/forge/nested_wayland.py` (~1.7k lines) | Full lifecycle; `cmd_nested` |
| Top-level CLI | `forge nested …` in `scripts/forge/forge` | User-visible subcommand + `hoist_nested_action_flags` |
| Help | `cli_help.py` lists `nested` next to product cmds | User-facing Commands |
| Test CLI | `forge test live …` (flat `test_which` / `live_action`) | Same binary; live matrix |
| Live matrix | `live_matrix.py` | Probe notes advertise `forge nested restart` / doctor |
| Units | `tests/unit/cli/test_nested_wayland.py` | Harness + hoist; refuse msg mentions `forge nested start` |
| Make | `nested-start` / `stop` / `restart` / `status`, `test-nested`, `test-open` | Call `./scripts/forge/forge nested …` |
| Install / reload msgs | `_lib.zsh`, `rebuild.zsh`, `migrate-from-ego.zsh` | Wayland guidance → `forge nested restart` |
| User docs | `docs/user/troubleshooting.md` | Recommends Nested for Wayland reload |
| Dev docs | CONTRIBUTING, `agents/testing.md`, HANDOFF, PRIORITY, project, meta-probe PROTOCOL, test-results README | FIRM `forge nested run` / restart |
| Install stamp | `./install` → `~/.local/bin/forge` full CLI | Nested rides along (no separate kit) |

**Out of inventory noise:** layout profile name `layout-tiles-nested.json` and tree
shape “nested HSPLIT” are **not** this product surface.

---

## Locked decisions (P0)

### 1. Entry point (primary FIRM string)

| | |
| --- | --- |
| **Primary** | **`forge test nested <action> …`** |
| Examples | `forge test nested run -- forge ping` · `forge test nested status` · `forge test nested restart` · `forge test nested doctor` |
| Flags | Same as today after the action (`--monitors=N`, `--replace`, `--keep`, …); hoist still rewrites flags-after-action |
| Module | `nested_wayland.py` stays; no Node port (CN14 later, non-goal here) |
| Make | `make nested-*` → `forge test nested …` |
| Rejected | Standalone `forge-nested` binary (extra PATH surface); repo-only `python3 -m` (agents need install PATH) |

### 2. Ship rule

| | |
| --- | --- |
| **Everyday user bundle** | Top-level **Commands** help + **user docs** do **not** present Nested as a product verb |
| **How testing tools still get it** | Same `./install` / `~/.local/bin/forge` binary (clone/dev). Nested is reachable only as **`forge test nested`** (and Makefile wrappers). No second package/kit in this plan |
| **User Wayland tip load** | Log out / log in — not Nested |
| **Agent / CONTRIBUTING** | Always the locked primary string |

### 3. Compat for top-level `forge nested`

| | |
| --- | --- |
| **Choice** | **Hard break** — top-level `nested` is **not** a working product command |
| **Migration** | Exit **2** + one-line stderr: use `forge test nested …` (error-only; **no** working alias) |
| **Argparse** | Nested may remain an internal parse path after rewrite from `test nested`, or live as a hidden subparser — must not appear in user help Commands |

### 4. `forge test` help / scope

| | |
| --- | --- |
| **Scope** | **Nested-first** — this slice moves Nested only; does **not** delete or hide `forge test live` |
| **Help** | Drop separate top-level `nested` row. Reword top-level `test` row to cover live matrix **and** nested retest (dev/agent). Nested detail under `forge test nested --help` / testing docs |
| **Not in this plan** | Separate install kit, Node nest port, D022 behavior changes |

### 5. Agent string rewrite scope (same implement slice as code)

Every FIRM / teachable string moves with P1:

- `agents/testing.md`, `HANDOFF.md`, `PRIORITY.md`, `project.md` (process lines)
- CONTRIBUTING, Makefile, live_matrix probe notes
- `_lib.zsh` / `rebuild.zsh` / `migrate-from-ego.zsh` Wayland guidance
- `docs/user/troubleshooting.md` — user path = logout; Nested only if we keep a
  **dev** pointer out of user first-steps (prefer drop Nested from user doc)
- Units: hoist prefix `test nested`; refuse/migration message strings
- Historical completed task bodies may keep old strings (archive); do not teach them

---

## Implement slices

| Id | Task | Goal | Status |
| --- | --- | --- | --- |
| **P0** | Plan lock | Inventory + decisions above | **done** |
| **P1** | Separate surface + docs + tests | Code + help + Makefile + agent FIRM + user docs + units in one coherent slice | **done** |

P2/P3 from earlier draft are **merged into P1** (diff stays one surface cut).

---

## Acceptance (plan-level)

- [x] P0: design locked — entry point, ship rule, compat, help scope
- [x] User-facing `forge help` / Commands list has **no** Nested product row
- [x] Nested usable as `forge test nested …` (start/run/stop/status/env/doctor/…)
- [x] Top-level `forge nested` → exit 2 + migration line (not a working alias)
- [x] User docs do not instruct Nested as daily-driver reload
- [x] Agent FIRM, Makefile, live matrix probe text use `forge test nested`
- [x] Units cover help surface + hoist + migration; campaign still ends `running: False`
- [x] Nest isolation semantics unchanged (D022)

---

## Code map (P1 touch list)

| Area | Paths |
| --- | --- |
| CLI router / hoist / main | `scripts/forge/forge` |
| Help | `scripts/forge/cli_help.py` |
| Nest messages | `scripts/forge/nested_wayland.py` (brand strings → `forge test nested`) |
| Live / test | `scripts/forge/live_matrix.py` |
| Install / reload msgs | `scripts/forge/_lib.zsh`, `rebuild.zsh`, `migrate-from-ego.zsh` |
| Make | `Makefile` nest targets |
| Units | `tests/unit/cli/test_nested_wayland.py` (+ help assert if easy) |
| User docs | `docs/user/troubleshooting.md` |
| Dev / agent | CONTRIBUTING, `agents/testing.md`, HANDOFF, PRIORITY, project process lines |

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Agents keep typing `forge nested` | Migration exit 2 + rewrite all FIRM strings in P1 |
| Live matrix / hoist break | Keep module path; rewrite `test nested` → internal nested parse; update hoist tests |
| Scope creep into Node port | Explicit non-goal |
| User needs host tip reload | User docs: logout/in only |

---

## Tasks

| Task | Status | Path |
| --- | --- | --- |
| P0 plan lock | **done** | [completed/…](./completed/forge-nested-cli-separation_p0-plan.md) |
| P1 separate + docs | **done** | [completed/…](./completed/forge-nested-cli-separation_p1-separate.md) |

---

## Session note

**2026-08-17 (done):** P0 locked then P1 shipped same day. Entry
**`forge test nested`**. Top-level `forge nested` hard-breaks (exit 2 + migration).
Help/Commands: Nested only under `test`. User troubleshooting: logout for host tip.
L0 nested units **27** green. Live: `forge test nested run -- forge ping` ok; nest
stopped. D022 unchanged.
