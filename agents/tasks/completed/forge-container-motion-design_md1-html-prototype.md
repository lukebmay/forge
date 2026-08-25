# Task: MD1 — HTML container-motion prototype

**Status:** done (2026-08-25) — `prototypes/container-motion/` (repo-hosted sandbox only)
**Plan:** [forge-container-motion-design.md](../../plans/forge-container-motion-design.md)
**Priority:** design sandbox (operator-requested; not Shell motion implement)

## Goal

Interactive sandbox so operator and agents can try peel Model B, edge no-op,
sibling move, wrap/group/flatten, multi-monitor geometry, and composed macros
**without** GNOME Shell.

## Shipped

| Item | Where |
| --- | --- |
| App | `prototypes/container-motion/` (`npm start` → :5177) |
| Desk + cytoscape tree views | linked highlights |
| Atomics + macros + Vim−Super keys | panels |
| Monitor presets (`black` default) | App panel |
| Peel B/A + edge toggles | view bar |
| README | same folder + `prototypes/README.md` |

MD2 (operator play → lock D1–D9) still open — no Shell motion patches from this alone.

## Out of scope (still)

- Shell / extension motion changes
- Locking D1–D9 (MD2)
