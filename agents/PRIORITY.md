# forge_jcrussell — active priorities

**Updated:** 2026-07-23  
**Cross-repo:** shellrc gdisplays v1 done; Forge trial is independent.

## Next session focus

**P1 — [forge-harden-and-session_soft-rehome](./tasks/forge-harden-and-session_soft-rehome.md)**  
Soft rehome on `workareas-changed` thrash (overnight auto-lock → all tiles on one monitor).

Plan: [forge-harden-and-session.md](./plans/forge-harden-and-session.md)

## After soft rehome

| Order | Slice | Depends |
| --- | --- | --- |
| 1 | Soft rehome / thrash survival | **Next** (repro confirmed on black) |
| 2 | Resize invariants (+ optional live-resize port) | Daily pain notes |
| 3 | Layout profiles + apply + DBus/CLI | Apply design |
| 4 | Stable monitor ids | Only if index thrash remains |

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| P1 | Soft rehome (H1) | **Next** |
| P2 | forge-fork-eval spike close-out (smoke table / daily-driver call) | Partial — on jcrussell; overnight lock still fails placement |
| P1 | harden-and-session (rest) | After H1 |
| later | `forge-fork-eval_quickwins` | After go-ahead |
| later | Personal fork | Only if jcrussell stalls |
| later | gdisplays v2 | shellrc only; not this repo |

## Do not

- Start from `~/dev/me/forge_original` for new work  
- Skip backup before install (same UUID replaces live extension)  
- Open gdisplays v2 from this repo  
- Build full i3 IPC — MVP is layout apply + tree query only  
