# forge_jcrussell — active priorities

**Updated:** 2026-07-25
**Cross-repo:** shellrc gdisplays v1 done; Forge trial is independent.

## Next session focus

**Official personal fork** — distinguish Luke’s tree from jcrussell.  
Task: [forge-fork-eval_personal-fork.md](./tasks/forge-fork-eval_personal-fork.md).

Also: live smoke of FC0–FC4 CLI after install; FC5 workon still deferred.

| Doc | Role |
| --- | --- |
| [forge-fork-eval_personal-fork.md](./tasks/forge-fork-eval_personal-fork.md) | **Next** — GitHub fork + lineage identity |
| [forge-command.md](./plans/forge-command.md) | FC0–FC4 **Done**; FC5 deferred |
| [forge-daily-driver.md](./plans/forge-daily-driver.md) | T0–T7 + OP1 done |
| [forge-harden-and-session.md](./plans/forge-harden-and-session.md) | Soft rehome done; batch via FC4 |
| Optional | OP-opt; T9; fork-eval spike close-out |

**T0–T7 + OP1 + FC0–FC4 done.** Product base still *code from* jcrussell; ownership not forked yet.

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| **P1** | **Official personal fork** (≠ jcrussell) | **Next** |
| P1 | Daily-driver T0–T5 | **Done** |
| P1 | OP1 open-app placement | **Done** |
| P1 | T6 full tree snapshot | **Done** |
| P1 | T7 stable mon roles | **Done** |
| P1 | FC0 DBus Ping + GetTree | **Done** |
| P1 | FC1 selectors + focus/move/swap | **Done** |
| P1 | FC2 forge launch | **Done** |
| P1 | FC3 settings get/set/save/load | **Done** |
| P1 | FC4 run-steps | **Done** |
| later | FC5 `workon` composition | **Deferred design** until asked |
| optional | OP-opt tiny-pane tab fallback | After P1s; notes in daily-driver |
| later | T9 multi-line tabs | After T1 proven |
| P2 | forge-fork-eval spike close-out | Partial |
| later | gdisplays v2 | shellrc only |

## Related completed

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
- Invent `workon` DSL before `forge` CLI (FC5 only after FC1–FC4)  
- Full i3 IPC — MVP is forge subcommands + tree query  
- SSH to black without **explicit** user permission (AGENTS security)  
- OP-opt tiny-pane heuristics in OP1  
