# forge_jcrussell — active priorities

**Updated:** 2026-07-24  
**Cross-repo:** shellrc gdisplays v1 done; Forge trial is independent.

## Next session focus

**P1 — Daily-driver T3 blank/wake + tab survival** (includes h1-verify)

| Doc | Role |
| --- | --- |
| [forge-daily-driver.md](./plans/forge-daily-driver.md) | **Execution plan** (start here) |
| Task | [t3](./tasks/forge-daily-driver_t3-blank-wake-tabs.md) |
| Related | [h1-verify](./tasks/forge-harden-and-session_h1-verify.md) |

**T0–T2 done.** T3 needs live verify on `black` (or explicit SSH). Overlay (`Ctrl+Super+d`) helps debug ratios/mon homes during thrash.

Default implement path: **A/B taskforce loop** (`agents/installed/general.md`).

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| P1 | Daily-driver T0 stack-off + DND tab | **Done** |
| P1 | Daily-driver T1 tab chrome (empty gap / 1-of-N) | **Done** |
| P2 | T2 layout debug overlay (opt-in, sooner) | **Done** |
| P1 | T3 blank/wake + tab survival (+ h1-verify) | **Ready** (next) |
| P2 | T4 sizing policy | After T3 |
| P2 | T5 keybind system (safe defaults, presets, save/load) | First-class; after T3 or parallel UX |
| later | T6–T8 snapshot / stable mon / session | After thrash solid |
| later | T9 multi-line tabs North Star (+ deferred T0 doc/schema nits) | After T1 proven |
| P2 | forge-fork-eval spike close-out | Partial — on jcrussell |
| later | gdisplays v2 | shellrc only; not this repo |

## Related completed

- [T2 layout debug overlay](./plans/forge-daily-driver/completed/forge-daily-driver_t2-layout-debug-overlay.md)
- [T1 tab chrome](./plans/forge-daily-driver/completed/forge-daily-driver_t1-tab-chrome.md)
- [T0 stack-off + DND tab](./plans/forge-daily-driver/completed/forge-daily-driver_t0-stack-off-dnd-tab.md)
- [soft-rehome H1 code](./plans/forge-harden-and-session/completed/forge-harden-and-session_soft-rehome.md) — live verify still via T3/h1-verify

## Do not

- Start from `~/dev/me/forge_original` for new work  
- Full rewrite / flex engine / pin-to-tile  
- Skip backup before install (same UUID replaces live extension)  
- Open gdisplays v2 from this repo  
- Build full i3 IPC — MVP is layout apply + tree query only  
- SSH to black without **explicit** user permission (AGENTS security)  
- Fix T0 doc/schema nits early — defer to T9 stack/tab merge  
