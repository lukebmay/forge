# forge_jcrussell — active priorities

**Updated:** 2026-07-27  
**Lens:** day-to-day impact on `black` (dual 4K, X11, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

## Next session focus

**Workon core reconcile accepted live (WR6).** Remaining polish is
**WR7+** (capture / stableKey / env) or **regression watch** if thrash
returns — plan [forge-workon-reconcile.md](./plans/forge-workon-reconcile.md).

| Order | ID | Task | Why first |
| ---: | --- | --- | --- |
| 1 | **WR7** | `forge workon capture` (later) | Authoring assist after live accept |
| — | residual | mon1 tab `roleOrder` settle | Non-blocking; opened stays 0 |

**WR1–WR6 + WR10–WR15 Done** (planner through live black accept).

Live thrash/tab bugs still **outrank** this queue if they return. Meta
(personal fork) stays below.

Product base is this tree (installed `v49-90-beta.2-47+`). Identity fork is
useful later; it does **not** fix windows.

| Doc | Role |
| --- | --- |
| [forge-workon-reconcile.md](./plans/forge-workon-reconcile.md) | **P1** — WR1–WR6 + WR10–15 **Done**; next **WR7** later |
| [forge-command.md](./plans/forge-command.md) | FC0–FC5 **Done** — imperative workon shipped |
| [forge-daily-driver.md](./plans/forge-daily-driver.md) | T0–T7 + OP1 + session-layout Ghostty **Done** |
| [forge-harden-and-session.md](./plans/forge-harden-and-session.md) | Soft rehome + install HUP path live |
| [forge-codebase-audit.md](./plans/forge-codebase-audit.md) | Wave 1 **done**; B1 optional size only |
| [forge-fork-eval_personal-fork.md](./tasks/forge-fork-eval_personal-fork.md) | Ownership / remotes — low daily tiling impact |

---

## Day-to-day impact ranking

Ordered by **how often it hurts or helps when actually using the machine**.

| Rank | Impact | Item | Why | Status |
| ---: | --- | --- | --- | --- |
| 1 | **Critical (shipped)** | Dual-head blank/wake + install HUP restore | Morning layout must survive lock/wake and `forge install` | **Done** — T3, T6, T7, session-layout + Ghostty |
| 2 | **Critical (shipped)** | Tabs, stack-off, open-app LFT, keybinds, sizing | Core daily tiling feel | **Done** — T0–T5, OP1 |
| 3 | **High (shipped core)** | **Idempotent `forge workon` + sugar + coexist** | Morning desk + lived-in companions + quick profiles | **WR1–WR6 + WR10–15 Done**; polish WR7+ later |
| 4 | **High (shipped, incomplete UX)** | FC5 imperative `workon` | Command + steps exist; doubles windows if re-run | **Superseded default by #3** — keep as `--force-launch` / `mode: steps` |
| 5 | **Medium (live)** | Regression watch: install/HUP, wake thrash, tab chrome | Failure modes that ruin a day if they return | **Monitor** — file bug when seen; **outranks #3 if open** |
| 6 | **Medium (QoL, shipped)** | OP-opt tiny-pane → tab fallback | Opt-in min-edge → tab instead of postage-stamp split | **Done** |
| 7 | **Low (meta)** | Personal GitHub fork + lineage id | Ownership, push target — not tiling | Ready when publishing |
| 8 | **Low (meta)** | Fork-eval spike formal close-out | Already daily-driving this tree | Docs only |
| 9 | **Low (code health)** | Audit B1 DnD extract | Shrinks `window.js`; zero user-visible win | Optional |
| 10 | **Later** | T9 multi-line tabs | Polish after single-row proven | Later |
| 11 | **Out of repo** | gdisplays v2; shellrc workon env (WR9); WR12 sugar profile | shellrc | Host tree shipped (WR4); sugar migrate WR12 |

**Rule of thumb:** prefer fixing a **layout regression you just hit** over meta/tidy.
Do not start B1 or personal-fork work while a real thrash/tab bug is open.
Idempotent workon polish (sugar + coexist) is the top **new** product work when
the desk is stable.

---

## Queue (execution)

| Pri | Item | Status | Day-to-day? |
| --- | --- | --- | --- |
| **P0** | Live thrash/tab bugs (if any) | **Interrupt** | Yes |
| **P1** | [workon](./plans/forge-workon-reconcile.md) core live **Done** (WR6) | Done | Yes |
| P2 | Live daily-drive; report new bugs | Ongoing | Yes |
| P3 | [Personal fork](./tasks/forge-fork-eval_personal-fork.md) | Ready | Ownership only |
| later | WR7 capture · WR8 stableKey · WR9 env | Later | Polish |
| later | T9 multi-line tabs | After T1 proven live | Polish |
| later | Audit **B1** DnD extract | Optional | Maintainability |
| later | gdisplays v2 | shellrc | Displays |

### Done recently (not open work)

| Item | Note |
| --- | --- |
| **WR6 live black** | [completed](./plans/forge-workon-reconcile/completed/forge-workon-reconcile_wr6-live.md) — chrome-luke `title~=` |
| **WR15 `--clean`** | [completed](./plans/forge-workon-reconcile/completed/forge-workon-reconcile_wr15-clean.md) |
| **WR14 tab settle** | [completed](./plans/forge-workon-reconcile/completed/forge-workon-reconcile_wr14-tab-settle.md) |
| **WR13 docs/help** | [completed](./plans/forge-workon-reconcile/completed/forge-workon-reconcile_wr13-docs.md) |
| **WR12 shellrc dev sugar** | [completed](./plans/forge-workon-reconcile/completed/forge-workon-reconcile_wr12-shellrc-dev-sugar.md) (shellrc uncommitted) |
| **WR11 marginal coexist** | [completed](./plans/forge-workon-reconcile/completed/forge-workon-reconcile_wr11-marginal-coexist.md) |
| **WR10 tiles sugar** | [completed](./plans/forge-workon-reconcile/completed/forge-workon-reconcile_wr10-tiles-sugar.md) |
| **WR1–WR5 workon reconcile** | Planner, resolve, executor, black profile, UX/docs |
| **Cross-mon Move + structure repair** | Meta monitor + tab group ensure |
| **CLI on PATH** | `~/.local/bin/forge` + `forge uninstall` |
| **OP-opt tiny-pane** | [completed](./plans/forge-daily-driver/completed/forge-daily-driver_op-opt-tiny-pane-tab.md) |
| **FC5 workon** | [completed](./plans/forge-command/completed/forge-command_fc5-workon.md) |
| T0–T7 + OP1 | Daily-driver core |
| FC0–FC4 | `forge` CLI control plane |
| Session-layout Ghostty | [completed](./plans/forge-daily-driver/completed/forge-daily-driver_session-layout-ghostty.md) |
| Soft rehome H1 | Harden path |
| Audit CA0–CA9 | Wave 1 tidy/extract |

---

## Session wrap (2026-07-27)

- **WR6 Done:** live black accept; chrome-luke `title~="Google Chrome"` (shellrc
  + examples + docs); unit match test; offline empty/partial/messy via
  `--tree-file`. Live opened 0 after fix; residual mon1.s0 roleOrder structure.
- **WR14–WR15** already Done (tab settle, `--clean`).
- **WR10–WR13** already Done (sugar, coexist, shellrc `dev`, docs).
- **Next:** WR7 capture later; thrash/regression watch outranks polish.

---

## Related completed

- [OP-opt tiny-pane tab](./plans/forge-daily-driver/completed/forge-daily-driver_op-opt-tiny-pane-tab.md)
- [FC5 workon](./plans/forge-command/completed/forge-command_fc5-workon.md)
- [session-layout Ghostty](./plans/forge-daily-driver/completed/forge-daily-driver_session-layout-ghostty.md)
- [audit CA0–CA9](./plans/forge-codebase-audit.md)
- [FC4 run-steps](./plans/forge-command/completed/forge-command_fc4-run-steps.md)
- [FC3 settings](./plans/forge-command/completed/forge-command_fc3-settings.md)
- [FC2 forge launch](./plans/forge-command/completed/forge-command_fc2-launch.md)
- [FC1 selectors + focus/move/swap](./plans/forge-command/completed/forge-command_fc1-selectors-move-swap.md)
- [FC0 DBus Ping + GetTree](./plans/forge-command/completed/forge-command_fc0-dbus-get-tree.md)
- [T7 stable mon roles](./plans/forge-daily-driver/completed/forge-daily-driver_t7-stable-outputs.md)
- [T6 full tree snapshot](./plans/forge-daily-driver/completed/forge-daily-driver_t6-full-tree-snapshot.md)
- [OP1 open-app placement](./plans/forge-daily-driver/completed/forge-daily-driver_op1-open-app-policy.md)
- [T5 keybind system](./plans/forge-daily-driver/completed/forge-daily-driver_t5-keybind-system.md)
- [T4 sizing policy](./plans/forge-daily-driver/completed/forge-daily-driver_t4-sizing-policy.md)
- [T3 blank/wake + tabs](./plans/forge-daily-driver/completed/forge-daily-driver_t3-blank-wake-tabs.md)
- [T2 layout debug overlay](./plans/forge-daily-driver/completed/forge-daily-driver_t2-layout-debug-overlay.md)
- [T1 tab chrome](./plans/forge-daily-driver/completed/forge-daily-driver_t1-tab-chrome.md)
- [T0 stack-off + DND tab](./plans/forge-daily-driver/completed/forge-daily-driver_t0-stack-off-dnd-tab.md)
- [soft-rehome H1](./plans/forge-harden-and-session/completed/forge-harden-and-session_soft-rehome.md)
- [h1-verify](./plans/forge-harden-and-session/completed/forge-harden-and-session_h1-verify.md)

## Do not

- Start from `~/dev/me/forge_original` for new work  
- Full rewrite / flex engine / pin-to-tile  
- Skip backup before install (same UUID replaces live extension)  
- Open gdisplays v2 from this repo  
- Full i3 IPC — MVP is forge subcommands + tree query  
- SSH to black without **explicit** user permission (AGENTS security)  
- Prioritize audit B1 or personal-fork over a live thrash bug  
- Ship imperative-only workon as the long-term morning UX  
- Default-kill marginal windows (park / coexist only; `--clean` opt-in)  
