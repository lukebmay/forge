# forge_jcrussell — active priorities

**Updated:** 2026-07-24  
**Cross-repo:** shellrc gdisplays v1 done; Forge trial is independent.

## Next session focus

**P1 — Daily-driver path T0 → T1** (stack off + tab chrome reliability)

| Doc | Role |
| --- | --- |
| [forge-daily-driver.md](./plans/forge-daily-driver.md) | **Execution plan** (start here) |
| [forge-layout-thrash-analysis.md](./plans/forge-layout-thrash-analysis.md) | Dual taskforce + product decisions |
| Tasks | [t0](./tasks/forge-daily-driver_t0-stack-off-dnd-tab.md) → [t1](./tasks/forge-daily-driver_t1-tab-chrome.md) |

Then: [t2 overlay](./tasks/forge-daily-driver_t2-layout-debug-overlay.md) → [t3 blank/wake](./tasks/forge-daily-driver_t3-blank-wake-tabs.md) (includes h1-verify).

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| P1 | Daily-driver T0 stack-off + DND tab | **Ready** |
| P1 | Daily-driver T1 tab chrome (empty gap / 1-of-N) | **Ready** after T0 |
| P2 | T2 layout debug overlay (opt-in, sooner) | After T1 |
| P1 | T3 blank/wake + tab survival (+ h1-verify) | After T1 install |
| P2 | T4 sizing policy | After T3 |
| P2 | T5 keybind system (safe defaults, presets, save/load) | First-class; after T3 or parallel UX |
| later | T6–T8 snapshot / stable mon / session | After thrash solid |
| later | T9 multi-line tabs North Star | After T1 proven |
| P2 | forge-fork-eval spike close-out | Partial — on jcrussell |
| later | gdisplays v2 | shellrc only; not this repo |

## Related completed

- [soft-rehome H1 code](./plans/forge-harden-and-session/completed/forge-harden-and-session_soft-rehome.md) — live verify still via T3/h1-verify

## Do not

- Start from `~/dev/me/forge_original` for new work  
- Full rewrite / flex engine / pin-to-tile  
- Skip backup before install (same UUID replaces live extension)  
- Open gdisplays v2 from this repo  
- Build full i3 IPC — MVP is layout apply + tree query only  
- SSH to black without **explicit** user permission (AGENTS security)  
