# forge_jcrussell — active priorities

**Updated:** 2026-07-23  
**Cross-repo:** shellrc gdisplays v1 done; Forge trial is independent.

## Next session focus

**P1 — Manual blank/wake verify of H1 soft rehome on `black`**  
After `make dev` / reload: dual tile → idle lock or DPMS → wake → windows should stay on both heads; retab must not crash.

Completed: [soft-rehome](./plans/forge-harden-and-session/completed/forge-harden-and-session_soft-rehome.md)  
Plan: [forge-harden-and-session.md](./plans/forge-harden-and-session.md)

## After soft rehome verify

| Order | Slice | Depends |
| --- | --- | --- |
| 1 | Soft rehome / thrash survival | **Implemented** — live verify next |
| 2 | Resize invariants (+ optional live-resize port) | Daily pain notes |
| 3 | Layout profiles + apply + DBus/CLI | Apply design |
| 4 | Stable monitor ids | Only if index thrash remains |

## Queue

| Pri | Item | Status |
| --- | --- | --- |
| P1 | Soft rehome (H1) | **Code done** — manual verify open |
| P2 | forge-fork-eval spike close-out (smoke table / daily-driver call) | Partial — on jcrussell |
| P1 | harden-and-session (H2–H4, resize, session) | After H1 verify |
| later | `forge-fork-eval_quickwins` | After go-ahead |
| later | Personal fork | Only if jcrussell stalls |
| later | gdisplays v2 | shellrc only; not this repo |

## Do not

- Start from `~/dev/me/forge_original` for new work  
- Skip backup before install (same UUID replaces live extension)  
- Open gdisplays v2 from this repo  
- Build full i3 IPC — MVP is layout apply + tree query only  
