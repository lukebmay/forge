# forge-cli-user-surface — User-only `forge` CLI (no test/dev toolkit)

**Status:** **done** 2026-08-17 (P0 lock + P1 implement)  
**Priority:** P1 product hygiene — user CLI surface  
**Branch:** `master`  
**Agent:** **4.6 high** (plan lock + implement)  
**Related:** [forge-nested-cli-separation](./forge-nested-cli-separation.md) (**done** —
nested under `forge test nested` only); [forge-ai-live-test-matrix](./forge-ai-live-test-matrix.md);
[forge-cli-node](./forge-cli-node.md) CN14; [testing.md](../testing.md);
[project.md](../project.md)

---

## Goal

**`forge` is a user-centric product CLI** (tiling control, layouts, settings,
install/update). It must **not** ship nested retest, live matrix, or other
dev/agent testing utilities to ordinary users.

| Audience | Gets |
| --- | --- |
| Daily-driver user (`./install` → `~/.local/bin/forge`) | Product verbs only: layout, tree, focus/swap/move, launch, run, get/set, keybind, ping, jobs, install/update, … |
| Developer / agent / CI | Separate **dev/test** surface (new binary and/or repo-only entry) that owns nested, live matrix, and any other test harness commands |

Nested already left the **top-level** product row ([nested separation](./forge-nested-cli-separation.md)). That was incomplete for the product rule: **`forge test` still lives on the user binary and in user help.** This plan finishes the cut: **all** testing utilities leave the user-delivered `forge` command.

Behavior of nest (D022), live matrix cases, and install kits is **not** reopened except where packaging/entry renames require it.

---

## Why

1. **User CLI ≠ dev toolkit.** Shipping `forge test …` teaches the wrong product
   shape and bloates help for people who never retest extension JS.
2. Nested-under-`test` still installs test tooling on every user PATH via
   `./install`.
3. A dedicated dev/test CLI can grow freely without polluting daily-driver UX.

---

## Inventory (P0 complete)

| Piece | Path / surface today | Role |
| --- | --- | --- |
| Nest harness | `scripts/forge/nested_wayland.py`; `cmd_nested` | Wayland retest loop (D022) |
| Nest argv | `normalize_nested_argv` / `hoist_nested_action_flags` in `scripts/forge/forge` | Rewrites `forge test nested` → internal `nested` |
| Live matrix catalog | `scripts/forge/live_matrix.py` | Cases / probe / select |
| Live runner | `_test_live_*` + `cmd_test` in `scripts/forge/forge` | Executes live cases |
| Test router | `cmd_test` / `test_which` (`live` only) + hidden `nested` parser | User-binary test surface |
| Help | `cli_help.py` Commands row `test`; argparse `test` parser | User-visible |
| Jobs | `job_runner` mutator `test` + `test_action==run` (1800s) | `forge test live run` |
| Make | `nested-*`, `test-open`, `test-nested` | Call `./scripts/forge/forge test nested …` |
| Agent FIRM | HANDOFF, PRIORITY, `agents/testing.md`, `project.md` | Teach `forge test nested` / `forge test live` |
| Units | `test_nested_wayland.py` (hoist + product entry), `test_cli_help.py`, job_runner `command="test"` | Entry strings |
| Install / reload | `./install` → `~/.local/bin/forge`; `_lib.zsh` / `rebuild.zsh` / `migrate-from-ego.zsh` Wayland hints | Delivers full CLI + teaches nest |
| Dev docs | CONTRIBUTING, `scripts/forge/README.md` jobs line, meta-probe PROTOCOL, test-results README | Teach `forge test …` |
| User docs | `docs/user/troubleshooting.md` | Logout on Wayland (already; keep) |

**Confirmed not user-CLI verbs (stay where they are):**

- Vitest / pytest / dump-oracle scripts
- `_forge-test-*` layout **profile names** (test data, not CLI)
- `forge thrash` (product settle-heuristics ops)
- `forge save-session-layout` (product, used before install)
- Internal test-only DBus

---

## Locked decisions (P0)

### 1. Dev/test entry name

| | |
| --- | --- |
| **Primary name** | **`forge-test`** |
| **Canonical file** | `scripts/forge/forge-test` |
| **Clone invocation** | `./scripts/forge/forge-test` (from repo root; always works) |
| **Verbs** | `forge-test nested <action> …` · `forge-test live <probe\|list\|plan\|run> …` |
| **Examples** | `./scripts/forge/forge-test nested run -- forge ping` · `./scripts/forge/forge-test live probe` |
| **Rejected** | `forge-dev` (vague); dual PATH names; repo-only `python3 -m` as the typed entry; keeping `forge test` as a working alias |

One name. Agents type `forge-test`. Copy-paste FIRM uses the clone path so it works without a PATH install.

### 2. Ship rule

| | |
| --- | --- |
| **Normal `./install`** | Symlinks **only** `~/.local/bin/forge` (product). **Does not** install `forge-test`. |
| **User `forge`** | No `test` / `nested` / `live` parse paths. No Commands help rows. Does not import nest/live modules. |
| **How agents/devs get tools** | Clone entry `./scripts/forge/forge-test`. Makefile `nested-*` wraps that file. |
| **Opt-in PATH** | `./install --with-test-cli` (also `forge install --with-test-cli`, `make install-test-cli`) → `~/.local/bin/forge-test`. Off by default. |
| **User Wayland tip load** | Log out / log in. Install messages must **not** teach nest. |
| **Uninstall** | Removes opt-in `forge-test` only when we own that symlink. |

### 3. Compat

| | |
| --- | --- |
| **Choice** | **Hard break** — no working alias on user `forge` |
| **`forge test …`** | Exit **2** + stderr: use `forge-test <nested\|live> …` / clone path |
| **`forge nested …`** | Exit **2** + same family (already hard-broke; retarget migration to `forge-test nested`) |
| **No dual-path** | User binary does not rewrite `test nested` into a working nest |

### 4. Module layout

| | |
| --- | --- |
| **Keep** | `nested_wayland.py` and `live_matrix.py` under `scripts/forge/` (import graph stays) |
| **New** | `scripts/forge/forge-test` (entry) · `scripts/forge/test_cli.py` (argv hoist + parsers + help) · `scripts/forge/live_cli.py` (`cmd_test` + `_test_live_*` moved off user `forge`) |
| **User `forge`** | Drops nest/live imports, parsers, hoist, `cmd_test` |
| **Jobs** | Mutator key becomes `live` (`live` + action `run`); keep 1800s ceiling |
| **Rejected** | Move tree to `scripts/forge-test/` or `cli-test/` this slice; Node port |

### 5. Docs rewrite scope

Rewrite teachable strings in the **same** implement slice:

- Agent FIRM: `agents/testing.md`, HANDOFF, PRIORITY, `project.md` process lines
- CONTRIBUTING, Makefile, `scripts/forge/README.md` (jobs line + short dev-CLI note)
- Units: hoist/entry/migration; help has no `test` row
- `_lib.zsh` / `migrate-from-ego.zsh` user-facing Wayland → **logout** (not nest)
- `rebuild.zsh` (dev script) + nest/live probe notes → `forge-test`
- `docs/user/` must not teach any test CLI (troubleshooting already logout)
- DECISIONS: **D045** (user `forge` vs `forge-test`)
- Historical completed task bodies may keep old strings

### 6. Non-goals

- Node port of nest/live (CN14 later)
- D022 nest isolation redesign
- Deleting harnesses or live cases
- Re-litigate D039–D044
- Tab click-drag PR5 product code
- Moving Vitest/pytest under `forge-test`

---

## Implement slices (after P0 lock)

| Id | Goal | Status |
| --- | --- | --- |
| **P0** | Inventory complete + decisions locked on disk | **done** |
| **P1** | User `forge` has no test surface; dev CLI works; help/docs/units/Makefile/agent FIRM updated; L0 green | **done** |

---

## Acceptance (plan-level)

- [x] P0 locked (entry name, ship rule, compat, module layout, docs scope)
- [x] User-facing `forge help` / Commands: **no** `test`, nested, live, or other
  dev-only harness rows
- [x] User-delivered binary cannot run nested/live matrix as product commands
  (hard break + clear migration, or absent parser)
- [x] Agents/devs have a working documented entry for nest + live matrix
- [x] Makefile + agent FIRM + units use the new entry; nest campaigns still stop
- [x] Nest isolation (D022) and live case semantics unchanged

---

## Tasks

| Task | Status | Path |
| --- | --- | --- |
| Plan + implement (user surface cut) | **done** | [completed](./completed/forge-cli-user-surface.md) |

---

## Session note

**2026-08-17 done.** Locked: `forge-test` clone entry `./scripts/forge/forge-test`;
normal `./install` does not ship it; `--with-test-cli` opt-in; `forge test` /
`forge nested` exit 2. Thrash stays product. D022/live cases unchanged.

**Entry strings (FIRM):** nest
`./scripts/forge/forge-test nested run -- …` · live
`./scripts/forge/forge-test live probe|plan|run …`

**L0:** pytest nested + help + job_runner + live_matrix **108 passed**.
`forge-test live list` 23 cases. `nested status` **running: False**. Doctor
can_nested=True. No nest started this slice.

**Risks:** PATH `forge-test` only after `--with-test-cli`; historical HANDOFF
shipped blocks may still show old `forge test nested` recipes.
