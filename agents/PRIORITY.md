# forge_jcrussell — active priorities

**Updated:** 2026-07-24  
**Cross-repo:** shellrc gdisplays v1 done; Forge trial is independent.

## Next session focus

**Later — T6 full in-memory tree snapshot** (layout durability for thrash/session)

| Doc | Role |
| --- | --- |
| [forge-daily-driver.md](./plans/forge-daily-driver.md) | Execution plan |
| Task | create `agents/tasks/forge-daily-driver_t6-full-tree-snapshot.md` |

**T0–T5 done.** Overlay: `Ctrl+Super+d`. Equalize: `Ctrl+Super+=` (Safe).
Keybind kits (Safe/Vim/i3 + save yours): Prefs → Keyboard.

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| P1 | Daily-driver T0 stack-off + DND tab | **Done** |
| P1 | Daily-driver T1 tab chrome (empty gap / 1-of-N) | **Done** |
| P2 | T2 layout debug overlay (opt-in, sooner) | **Done** |
| P1 | T3 blank/wake + tab survival (+ h1-verify) | **Done** (live black) |
| P2 | T4 sizing policy | **Done** |
| P2 | T5 keybind system (safe defaults, presets, save/load) | **Done** |
| later | T6–T8 snapshot / stable mon / session | **Next** (T6) |
| later | T9 multi-line tabs North Star (+ deferred T0 doc/schema nits) | After T1 proven |
| P2 | forge-fork-eval spike close-out | Partial — on jcrussell |
| later | gdisplays v2 | shellrc only; not this repo |

## Related completed

- [T5 keybind system](./plans/forge-daily-driver/completed/forge-daily-driver_t5-keybind-system.md)
- [T4 sizing policy](./plans/forge-daily-driver/completed/forge-daily-driver_t4-sizing-policy.md)
- [T3 blank/wake + tabs](./plans/forge-daily-driver/completed/forge-daily-driver_t3-blank-wake-tabs.md)
- [T2 layout debug overlay](./plans/forge-daily-driver/completed/forge-daily-driver_t2-layout-debug-overlay.md)
- [T1 tab chrome](./plans/forge-daily-driver/completed/forge-daily-driver_t1-tab-chrome.md)
- [T0 stack-off + DND tab](./plans/forge-daily-driver/completed/forge-daily-driver_t0-stack-off-dnd-tab.md)
- [soft-rehome H1 code](./plans/forge-harden-and-session/completed/forge-harden-and-session_soft-rehome.md)
- [h1-verify live](./plans/forge-harden-and-session/completed/forge-harden-and-session_h1-verify.md)

## Do not

- Start from `~/dev/me/forge_original` for new work  
- Full rewrite / flex engine / pin-to-tile  
- Skip backup before install (same UUID replaces live extension)  
- Open gdisplays v2 from this repo  
- Build full i3 IPC — MVP is layout apply + tree query only  
- SSH to black without **explicit** user permission (AGENTS security)  
- Fix T0 doc/schema nits early — defer to T9 stack/tab merge  
