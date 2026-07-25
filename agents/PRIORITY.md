# forge_jcrussell — active priorities

**Updated:** 2026-07-25  
**Cross-repo:** shellrc gdisplays v1 done; Forge trial is independent.

## Next session focus

**FC2–FC4 — `forge` CLI** (DBus control plane). See [forge-command.md](./plans/forge-command.md).
FC0 Done. FC5 `workon` deferred until subcommands exist.

| Doc | Role |
| --- | --- |
| [forge-command.md](./plans/forge-command.md) | **Next** — FC2+ |
| [forge-daily-driver.md](./plans/forge-daily-driver.md) | T0–T7 + OP1 done |
| [forge-harden-and-session.md](./plans/forge-harden-and-session.md) | Soft rehome done; batch runtime sketch |
| Task | create `agents/tasks/forge-command_fc2-….md` per plan |

**T0–T5 + OP1 + T6 + T7 + FC0–FC1 done.** Overlay: `Ctrl+Super+d`. Equalize: `Ctrl+Super+=` (Safe).

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| P1 | Daily-driver T0–T5 | **Done** |
| P1 | OP1 open-app placement | **Done** |
| P1 | T6 full tree snapshot | **Done** |
| P1 | T7 stable mon roles | **Done** |
| P1 | FC0 DBus Ping + GetTree | **Done** |
| P1 | FC1 selectors + focus/move/swap | **Done** |
| **P1** | **FC2–FC4 `forge` CLI** | **Next** |
| later | FC5 `workon` composition | **Deferred design** until forge CLI real |
| optional | OP-opt tiny-pane tab fallback | After P1s; notes in daily-driver |
| later | T9 multi-line tabs | After T1 proven |
| P2 | forge-fork-eval spike close-out | Partial |
| later | gdisplays v2 | shellrc only |

## Related completed

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
