# forge_jcrussell — active priorities

**Updated:** 2026-07-26  
**Lens:** day-to-day impact on `black` (dual 4K, X11, Shell 46), not tidy purity.  
**Cross-repo:** life P0 (finances / job search) outranks Forge; this file is **Forge only**.

## Next session focus

**Live on the fork** — open bugs only when layout pain returns.  
OP-opt tiny-pane tab fallback **Done** (opt-in gsettings).  
Identity/personal-fork is meta only (needs GitHub name/lineage decisions).

Product base is this tree (installed `v49-90-beta.2-42+`). Identity fork is
useful later; it does **not** fix windows.

| Doc | Role |
| --- | --- |
| [forge-command.md](./plans/forge-command.md) | FC0–FC5 **Done** — `forge workon` shipped |
| [forge-daily-driver.md](./plans/forge-daily-driver.md) | T0–T7 + OP1 + session-layout Ghostty **Done** |
| [forge-harden-and-session.md](./plans/forge-harden-and-session.md) | Soft rehome + install HUP path live |
| [forge-codebase-audit.md](./plans/forge-codebase-audit.md) | Wave 1 **done**; B1 optional size only |
| [forge-fork-eval_personal-fork.md](./tasks/forge-fork-eval_personal-fork.md) | Ownership / remotes — low daily tiling impact |
| [forge-fork-eval_spike.md](./tasks/forge-fork-eval_spike.md) | Spike close-out docs — mostly historical |

---

## Day-to-day impact ranking

Ordered by **how often it hurts or helps when actually using the machine**.

| Rank | Impact | Item | Why | Status |
| ---: | --- | --- | --- | --- |
| 1 | **Critical (shipped)** | Dual-head blank/wake + install HUP restore | Morning layout must survive lock/wake and `forge install` | **Done** — T3, T6, T7, session-layout + Ghostty |
| 2 | **Critical (shipped)** | Tabs, stack-off, open-app LFT, keybinds, sizing | Core daily tiling feel | **Done** — T0–T5, OP1 |
| 3 | **High (shipped)** | **FC5 `workon` composition** | One command → displays + dual Ghostty + tabs morning layout | **Done** — A/B AGREE |
| 4 | **Medium (live)** | Regression watch: install/HUP, wake thrash, tab chrome | Still the failure modes that ruin a day if they return | **Monitor** — no open task; file bug when seen |
| 5 | **Medium (QoL, shipped)** | OP-opt tiny-pane → tab fallback | Opt-in min-edge → tab instead of postage-stamp split | **Done** — A/B AGREE; default off |
| 6 | **Low (meta)** | Personal GitHub fork + lineage id | Ownership, push target, mental model — not tiling | Ready when publishing |
| 7 | **Low (meta)** | Fork-eval spike formal close-out | Already daily-driving this tree | Docs only |
| 8 | **Low (code health)** | Audit B1 DnD extract | Shrinks `window.js`; zero user-visible win | Optional wave 2 |
| 9 | **Later** | T9 multi-line tabs | Polish after single-row proven in real use | Later |
| 10 | **Out of repo** | gdisplays v2 | shellrc only | — |

**Rule of thumb:** prefer fixing a **layout regression you just hit** over meta/tidy.
Do not start B1 or personal-fork work while a real thrash/tab bug is open.

---

## Queue (execution)

| Pri | Item | Status | Day-to-day? |
| --- | --- | --- | --- |
| **P1** | Live daily-drive this install; report thrash/tab bugs | **Default** | Yes |
| P2 | [Personal fork](./tasks/forge-fork-eval_personal-fork.md) | Ready (needs name/lineage) | Ownership only |
| P2 | [Spike close-out](./tasks/forge-fork-eval_spike.md) | Partial | Docs |
| later | T9 multi-line tabs | After T1 proven live | Polish |
| later | Audit **B1** DnD extract | Optional | Maintainability |
| later | gdisplays v2 | shellrc | Displays |

### Done recently (not open work)

| Item | Note |
| --- | --- |
| **OP-opt tiny-pane** | [completed](./plans/forge-daily-driver/completed/forge-daily-driver_op-opt-tiny-pane-tab.md) |
| **FC5 workon** | [completed](./plans/forge-command/completed/forge-command_fc5-workon.md) |
| T0–T7 + OP1 | Daily-driver core |
| FC0–FC4 | `forge` CLI control plane |
| Session-layout Ghostty | [completed](./plans/forge-daily-driver/completed/forge-daily-driver_session-layout-ghostty.md) |
| Soft rehome H1 | Harden path |
| Audit CA0–CA9 | Wave 1 tidy/extract |

---

## Session wrap (2026-07-26)

- **FC5 Done (A/B AGREE):** `forge workon` / mixed `forge run`; 23 pure Python tests.
- **OP-opt Done (A/B AGREE):** tiny-pane tab fallback (default off); npm **1879**.
- Stopped further task init: remaining queue is meta (personal fork needs Luke
  decisions) or docs-only spike close-out.
- **No commit** this session unless asked.

**Default next:** live-drive + file bugs; personal fork when publishing wanted.

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
